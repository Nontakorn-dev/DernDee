import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GeminiLiveClient} from '../shared/coach/geminiLiveClient.js';
import WalkAvatarStage from '../apps/patient/src/components/walk/WalkAvatarStage.jsx';
import '../shared/index.css';
function Preview() {
  const client = useRef(null);
  const [state,setState]=useState('idle');
  const [subtitle,setSubtitle]=useState('');
  const [events,setEvents]=useState([]);
  useEffect(()=>()=>client.current?.disconnect(),[]);
  const connect=async()=>{
    client.current?.disconnect();
    const next=new GeminiLiveClient({onStateChange:value=>{setState(value);setEvents(old=>[...old, value]);},onSubtitleChange:setSubtitle});
    client.current=next;
    try { await next.ensureAudioReady(); await next.connect(); } catch(error){setSubtitle(error.message);}
  };
  return <main style={{maxWidth:800,margin:'auto',padding:24,background:'#edf5f1'}}>
    <p>ตรวจเสียง Live และอวาตาร์ · ไม่เปิดไมค์หรือบันทึกการเดิน</p>
    <button onClick={connect}>เชื่อมต่อเพื่อทดสอบ</button>
    <button style={{margin:16}} disabled={state!=='ready'} onClick={()=>client.current?.askWithTextAndSpeak('นี่คือการทดสอบเสียง ตอบสั้น ๆ ว่า พร้อมเดินไปด้วยกันแล้วครับ',{force:true,interrupt:true})}>ส่งข้อความทดสอบเสียง</button>
    <p role="status">สถานะ: {state}</p>
    <div style={{height:400}}><WalkAvatarStage talking={state==='speaking'} subtitle={subtitle}/></div>
    <p>{events.join(' → ')}</p>
  </main>;
}
if(import.meta.env.DEV) createRoot(document.getElementById('root')).render(<Preview/>);
