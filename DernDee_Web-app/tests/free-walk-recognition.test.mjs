import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../apps/patient/src/components/walk/FreeWalkSession.jsx',import.meta.url),'utf8');
const body=source.slice(source.indexOf('  const startBrowserAsk ='),source.indexOf('  const handleAskCoachStart ='));
function setup() {
  let recognizer;
  const sent=[];
  const noop=()=>{};
  const client={getState:()=> 'ready',ensureAudioReady:noop,waitUntilReady:async()=>true};
  const context=vm.createContext({
    COACH_CONNECTION_STATES:{CLOSED:'closed',ERROR:'error'},
    questionSentRef:{current:false},askCoachActiveRef:{current:false},
    speechRecognitionRef:{current:null},coachClientRef:{current:client},
    latestParamsRef:{current:{cadence_spm:80}},sessionElapsedRef:{current:42},
    clearAskReplyWatch:noop,beginAskLipSync:noop,setAskCoachActive:noop,setCoachSubtitle:noop,
    initializeCoach:noop,endAskLipSync:noop,finishAskListen:noop,
    orchestratorRef:{current:{buildUserQuestionDispatch:(gait,question,time)=>({gait,question,time})}},
    dispatchCoachLine:async value=>sent.push(value),
  });
  vm.runInContext(body+'globalThis.start = startBrowserAsk;',context);
  class Recognition {constructor(){recognizer=this;} start(){} stop(){} }
  context.start(Recognition);
  return {get r(){return recognizer;},sent};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('recognized question includes gait context and is sent once across final/end events',async()=>{
  const h=setup();
  const result= [{transcript:'ควรเดินอย่างไร'}]; result.isFinal=true;
  h.r.onresult({results:[result]});h.r.onend();await flush();
  assert.equal(h.sent.length,1);
  assert.equal(h.sent[0].question,'ควรเดินอย่างไร');
  assert.equal(h.sent[0].gait.cadence_spm,80);
});
test('releasing with interim text submits it; recognition errors do not submit partial text',async()=>{
  let h=setup();const result=[{transcript:'ติดเซ็นเซอร์ตรงไหน'}];result.isFinal=false;
  h.r.onresult({results:[result]});assert.equal(h.sent.length,0);h.r.onend();await flush();assert.equal(h.sent.length,1);
  h=setup();h.r.onresult({results:[result]});h.r.onerror({error:'not-allowed'});h.r.onend();await flush();assert.equal(h.sent.length,0);
});
