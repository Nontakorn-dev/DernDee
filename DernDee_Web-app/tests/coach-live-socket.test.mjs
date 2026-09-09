import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectCoachLiveSession } from '../shared/coach/geminiLiveSocket.js';
import { buildCoachLiveSessionConfig } from '../shared/coach/coachSystemInstruction.js';
class Socket {
  static OPEN = 1;
  static latest;
  readyState = 1;
  handlers = {};
  sent = [];
  constructor() { Socket.latest = this; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  send(text) { this.sent.push(JSON.parse(text)); }
  close() { this.readyState = 3; }
  emit(name, event = {}) { this.handlers[name]?.(event); }
}
globalThis.WebSocket = Socket;
test('native Live uses AUDIO + output transcription and waits for setup acknowledgement', async () => {
  const config = buildCoachLiveSessionConfig();
  assert.deepEqual(config.responseModalities, ['AUDIO']);
  let ready = false;
  const connecting = connectCoachLiveSession({token:'test', model:'test-model', callbacks:{onopen:()=>ready=true}});
  const socket = Socket.latest;
  socket.emit('open');
  assert.equal(ready, false);
  assert.deepEqual(socket.sent[0].setup.generationConfig.responseModalities, ['AUDIO']);
  assert.deepEqual(socket.sent[0].setup.outputAudioTranscription, {});
  socket.emit('message', {data: JSON.stringify({setupComplete:{}})});
  const session = await connecting;
  assert.equal(ready, true);
  session.close();
});
test('rejected setup fails connection instead of reporting ready', async () => {
  let ready = false;
  const connecting = connectCoachLiveSession({token:'test',callbacks:{onopen:()=>ready=true}});
  const rejected = assert.rejects(connecting, /1007.*unsupported/);
  Socket.latest.emit('open');
  Socket.latest.emit('close', {code:1007,reason:'unsupported modality'});
  await rejected;
  assert.equal(ready, false);
});
