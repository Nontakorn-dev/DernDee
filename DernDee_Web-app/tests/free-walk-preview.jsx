import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/index.css';
import '../apps/patient/src/components/walk/FreeWalkSession.css';
import WalkAvatarStage from '../apps/patient/src/components/walk/WalkAvatarStage.jsx';
import WalkRiverScene from '../apps/patient/src/components/walk/WalkRiverScene.jsx';
import { WalkSessionClock, WalkStepCount } from '../apps/patient/src/components/walk/WalkSessionHud.jsx';
import WalkMicButton from '../apps/patient/src/components/walk/WalkMicButton.jsx';
import WalkPauseDialog from '../apps/patient/src/components/walk/WalkPauseDialog.jsx';

function Preview() {
  const [clip, setClip] = useState('idle');
  const [paused, setPaused] = useState(false);
  const [talking, setTalking] = useState(false);
  const [packed, setPacked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  return <div className="free-walk-session" style={{ minHeight: '100dvh', padding: 16 }}>
    <p>หน้าตรวจภาพ · ไม่มีการบันทึกข้อมูลการเดินหรือเปิดไมค์</p>
    <div style={{ display:'flex', flexWrap:'wrap', gap:12, padding:12 }}>
      <button onClick={() => setClip('greeting')}>เล่นคลิปทักทาย</button>
      <button onClick={() => setClip('nearEnd')}>เล่นคลิปใกล้ถึง</button>
      <button onClick={() => setClip('turnRest')}>เล่นคลิปกลับตัวแล้วคำแนะนำ</button>
      <button onClick={() => setClip('walkwayFaster0')}>เล่นคลิปเดินกลับ</button>
      <button onClick={() => {setClip('idle');setTalking(false);}}>Idle</button>
      <button onClick={() => setTalking(v => !v)}>สลับตอบคำถาม</button>
      <button onClick={() => setPauseOpen(true)}>เปิดป็อปอัป Pause</button>
      <button onClick={() => setPacked(v => !v)}>รูปแบบ {packed ? 'Packed MP4' : 'WebM'}</button>
      <button onClick={() => setProgress(v => Math.round((v + 0.5) * 10) / 10 % 10)}>จำลองก้าว</button>
      <button onClick={() => setMobile(v => !v)}>สลับขนาดมือถือ</button>
    </div>
    <div style={{maxWidth:mobile?390:1100, margin:'auto'}}>
      <div style={{position:'relative',height:mobile?450:480,marginTop:16}}>
        <WalkRiverScene
          progressM={progress % 5}
          lengthM={5}
          direction={progress >= 5 ? 'back' : 'out'}
          paused={paused}
        />
        {clip !== 'idle' || talking || active ? <div className="walk-scene-frost" aria-hidden="true" /> : null}
        <WalkSessionClock timeElapsed={42} />
        <div className={`walk-coach-overlay ${clip !== 'idle' || talking || active ? 'is-expanded' : 'is-docked'}`}>
          <WalkAvatarStage key={packed ? 'packed' : 'webm'} clipId={clip} docked fillFrame renderMode={packed?'packed':'native'} paused={paused&&!talking} talking={talking} onEnded={() => setClip((current) => (current === 'turnRest' ? 'walkwayFaster0' : 'idle'))}/>
        </div>
      </div>
      <div className="walk-controls" style={{marginTop:16}}>
        <div className="walk-controls__row">
          <button type="button" onClick={() => { setPaused(true); setPauseOpen(true); }} className="walk-controls__btn walk-controls__pause">Pause</button>
          <WalkMicButton active={active} onPressStart={() => setActive(true)} onPressEnd={() => setActive(false)}/>
          <WalkStepCount steps={Math.round(progress * 2)} />
        </div>
      </div>
    </div>
    <WalkPauseDialog
      open={pauseOpen}
      onContinue={() => { setPauseOpen(false); setPaused(false); }}
      onStop={() => setPauseOpen(false)}
    />
  </div>;
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')).render(<React.StrictMode><Preview/></React.StrictMode>);
