import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import vm from 'node:vm';

const source = (await readFile(new URL('../apps/patient/src/components/walk/WalkMicButton.jsx',import.meta.url),'utf8')).replace(/^import .*;$/gm,'').replace('export default WalkMicButton;', 'globalThis.Component = WalkMicButton;');
const code = (await transform(source,{loader:'jsx',format:'iife'})).code;
function harness(start = () => {}) {
  let now=0, index=0, ends=0, starts=0;
  const refs=[];
  const context = vm.createContext({Promise,Date:{now:()=>now},Mic:()=>null,
    useRef:value=> refs[index++] ?? (refs[index-1]={current:value}),
    React:{createElement:(type,props,...children)=>({type,props,children})}});
  vm.runInContext(code,context);
  const render=(active=false,busy=false)=>{
    index=0;
    return context.Component({active,busy,onPressStart:()=>{starts++;return start();},onPressEnd:()=>{ends++;}}).props;
  };
  const event={button:0,preventDefault(){},currentTarget:{setPointerCapture(){}},pointerId:1};
  return {render,event,advance:ms=>now+=ms,counts:()=>({starts,ends})};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('short tap keeps listening, second tap ends once',async()=>{
  const h=harness();let p=h.render();p.onPointerDown(h.event);h.advance(100);p.onPointerUp(h.event);p.onClick({detail:1});
  await flush();assert.deepEqual(h.counts(),{starts:1,ends:0});
  p=h.render(true);p.onPointerDown(h.event);p.onPointerUp(h.event);await flush();
  assert.deepEqual(h.counts(),{starts:1,ends:1});
});
test('hold release during microphone preparation ends when preparation settles',async()=>{
  let resolve;const pending=new Promise(r=>resolve=r);const h=harness(()=>pending);
  const p=h.render();p.onPointerDown(h.event);h.advance(500);p.onPointerUp(h.event);
  await flush();assert.equal(h.counts().ends,0);
  resolve();await flush();assert.deepEqual(h.counts(),{starts:1,ends:1});
});
test('keyboard toggle and cancelled gesture finish capture',async()=>{
  const h=harness();h.render().onClick({detail:0});h.render(true).onClick({detail:0});await flush();
  assert.deepEqual(h.counts(),{starts:1,ends:1});
  const p=h.render();p.onPointerDown(h.event);p.onPointerCancel();await flush();
  assert.deepEqual(h.counts(),{starts:2,ends:2});
});
