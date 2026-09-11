import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

if (typeof globalThis.btoa !== 'function') {
  globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
}

// Stub network/audio output imports only; run the actual capture implementation.
const source = (await readFile(new URL('../shared/coach/geminiLiveClient.js', import.meta.url), 'utf8')).replace(/^import .*;$/gm, '');
const { GeminiLiveClient } = await import(`data:text/javascript;base64,${Buffer.from('class PcmAudioPlayer { stop() {} destroy() {} isPlaying() { return false; } }\nconst isCoachGreetingSpeech = () => false;\n' + source).toString('base64')}`);
function setup(getUserMedia) {
  const events = [];
  class Context {
    state = 'suspended';
    sampleRate = 48000;
    destination = { id: 'speakers' };
    resume() { events.push('resume'); this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() {
      const processor = {
        connect(node) { events.push(node?.id || 'unknown'); },
        disconnect() {},
        onaudioprocess: null,
      };
      events.processor = processor;
      return processor;
    }
    createGain() { return { id: 'gain', gain: { value: 0 }, connect(node) { events.push(node?.id || 'gain-out'); }, disconnect() {} }; }
    createMediaStreamDestination() { return { id: 'sink', stream: {}, connect() {}, disconnect() {} }; }
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia } } });
  globalThis.window = { AudioContext: Context };
  globalThis.AudioContext = Context;
  return events;
}
function stream() {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  return { getTracks: () => [track], getAudioTracks: () => [track] };
}
test('preparation resumes audio and requests permission immediately; concurrent requests share one stream', async () => {
  let resolve, requests = 0;
  const events = setup(() => { requests++; return new Promise(r => resolve = r); });
  const client = new GeminiLiveClient();
  const first = client.prepareMic();
  const second = client.ensureMicStream();
  assert.deepEqual(events, ['resume']);
  assert.equal(requests, 1);
  resolve(stream());
  assert.equal(await first, true);
  assert.equal(await second, client.mediaStream);
  await client.stopPushToTalk();
});
test('denied permission reports failure, never starts listening', async () => {
  setup(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
  const client = new GeminiLiveClient();
  assert.equal(await client.prepareMic(), false);
  assert.match(client.describeMicError(), /ไม่อนุญาต/);
  assert.equal(client.micActive, false);
  await client.stopPushToTalk();
});
test('leaving while permission is pending stops a late stream', async () => {
  let resolve;
  setup(() => new Promise(r => resolve = r));
  const client = new GeminiLiveClient();
  const request = client.prepareMic();
  client.releaseMicStream();
  const late = stream();
  resolve(late);
  assert.equal(await request, false);
  assert.equal(late.getAudioTracks()[0].readyState, 'ended');
  assert.equal(client.mediaStream, null);
  await client.stopPushToTalk();
});
test('capture starts on ready session and stopping releases the microphone', async () => {
  const captured = stream();
  setup(() => Promise.resolve(captured));
  const client = new GeminiLiveClient();
  const messages = [];
  client.session = { sendRealtimeInput: message => messages.push(message) };
  assert.equal(await client.prepareMic(), true);
  assert.equal(await client.startPushToTalk(), true);
  assert.equal(client.micActive, true);
  await client.stopPushToTalk();
  assert.equal(client.micActive, false);
  assert.equal(captured.getAudioTracks()[0].readyState, 'ended');
  assert.deepEqual(messages, [{ activityStart: {} }, { activityEnd: {} }]);
});
test('Live audio starts before transcript and turnComplete; gaps do not stop avatar', () => {
  const states = [], audio = [];
  const client = new GeminiLiveClient({onStateChange: value => states.push(value)});
  client.outputArmed = true;
  let playing = false;
  client.audioPlayer.isPlaying = () => playing;
  client.audioPlayer.enqueueBase64Pcm = value => {
    audio.push(value); playing = true; client.handlePlaybackSpeaking(true);
  };
  client.handleServerMessage({serverContent:{modelTurn:{parts:[{inlineData:{data:'first-chunk'}}]}}});
  assert.deepEqual(audio,['first-chunk']);
  assert.equal(client.getState(),'speaking');
  playing = false;
  client.handlePlaybackSpeaking(false);
  assert.equal(client.getState(),'speaking', 'inter-chunk gap must not clear talking');
  client.handleServerMessage({serverContent:{modelTurn:{parts:[{inlineData:{data:'second-chunk'}}]},turnComplete:true}});
  assert.equal(client.getState(),'speaking', 'queued audio must finish after turnComplete');
  playing = false;
  client.handlePlaybackSpeaking(false);
  assert.equal(client.getState(),'ready');
});
test('finishing microphone requests Live response without waiting for transcript or TTS', async () => {
  setup(() => Promise.resolve(stream()));
  const client = new GeminiLiveClient();
  client.micActive = true;
  const messages = [];
  client.session = {sendRealtimeInput: value => messages.push(value)};
  assert.equal(await client.finishMicAskAndSpeak(), true);
  assert.deepEqual(messages,[{activityEnd:{}}]);
  assert.equal(client.outputArmed,true);
});
test('unrequested or muted Live audio is not played', () => {
  const client = new GeminiLiveClient();
  client.audioPlayer.enqueueBase64Pcm = () => assert.fail('unrequested audio');
  const chunk = {serverContent:{modelTurn:{parts:[{inlineData:{data:'pcm'}}]}}};
  client.handleServerMessage(chunk);
  client.outputArmed = true;
  client.muted = true;
  client.handleServerMessage(chunk);
});

test('interrupting speech returns to ready so the next question can start', () => {
  const client = new GeminiLiveClient();
  client.state = 'speaking';
  client.audioPlayer.stop = () => client.handlePlaybackSpeaking(false);
  client.disarmOutput();
  assert.equal(client.getState(), 'ready');
});
test('turnComplete without audio does not re-emit ready', () => {
  const states = [];
  const client = new GeminiLiveClient({ onStateChange: (value) => states.push(value) });
  client.outputArmed = true;
  client.state = 'ready';
  client.handleServerMessage({ serverContent: { turnComplete: true } });
  assert.deepEqual(states, []);
});
test('non-PCM inline data is not decoded as speaker samples', () => {
  const client = new GeminiLiveClient();
  client.outputArmed = true;
  client.audioPlayer.enqueueBase64Pcm = () => assert.fail('invalid audio payload');
  client.handleServerMessage({serverContent:{modelTurn:{parts:[{inlineData:{data:'compressed',mimeType:'audio/mpeg'}}]}}});
});
test('mic capture zeros processor output and keeps it off the speakers', async () => {
  const events = setup(() => Promise.resolve(stream()));
  const client = new GeminiLiveClient();
  client.session = { sendRealtimeInput() {} };
  assert.equal(await client.prepareMic(), true);
  assert.equal(await client.startPushToTalk(), true);
  assert.ok(client.micSink);
  assert.ok(events.includes('sink'));
  assert.equal(events.includes('speakers'), false);
  const output = new Float32Array(8).fill(0.8);
  events.processor.onaudioprocess({
    outputBuffer: { numberOfChannels: 1, getChannelData: () => output },
    inputBuffer: { getChannelData: () => new Float32Array(8) },
  });
  assert.ok(output.every((sample) => sample === 0));
  await client.stopPushToTalk();
  assert.equal(client.micSink, null);
});
