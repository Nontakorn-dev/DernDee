import React, { useEffect, useRef, useState } from 'react';
import { walkwayTrackPosition } from '@shared/gait/walkwayTrackPosition.js';
import {
  WALKER_BACK_STILL,
  WALKER_DOWN_SHEET,
  WALKER_FRAMES_PER_STEP,
  WALKER_FRONT_STILL,
  WALKER_SHEET_FRAMES,
  WALKER_STEP_MS,
  WALKER_UP_SHEET,
  nextWalkerFrame,
  queuedWalkerSteps,
} from './walkSprites.js';
import './WalkRiverScene.css';

function useImageExists(src) {
  const [exists, setExists] = useState(false);

  useEffect(() => {
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (live) setExists(true);
    };
    image.onerror = () => {
      if (live) setExists(false);
    };
    image.src = src;
    return () => {
      live = false;
    };
  }, [src]);

  return exists;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useWalkPose(progressM, paused) {
  const [frame, setFrame] = useState(0);
  const [stepping, setStepping] = useState(false);
  const frameRef = useRef(0);
  const prevProgressRef = useRef(progressM);
  const queueRef = useRef(0);
  const playingRef = useRef(false);
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    const stopPlayback = () => {
      window.clearTimeout(timerRef.current);
      playingRef.current = false;
      queueRef.current = 0;
      frameRef.current = 0;
      setFrame(0);
      setStepping(false);
    };

    if (paused) {
      stopPlayback();
      prevProgressRef.current = progressM;
      return undefined;
    }

    const previousProgressM = prevProgressRef.current;
    prevProgressRef.current = progressM;

    if (progressM + 0.05 < previousProgressM) {
      stopPlayback();
      return undefined;
    }

    queueRef.current = queuedWalkerSteps(previousProgressM, progressM, queueRef.current);

    const playQueuedStep = () => {
      if (playingRef.current || queueRef.current <= 0) {
        if (!playingRef.current) setStepping(false);
        return;
      }

      playingRef.current = true;
      queueRef.current -= 1;
      setStepping(true);

      if (prefersReducedMotion()) {
        frameRef.current = (frameRef.current + WALKER_FRAMES_PER_STEP) % WALKER_SHEET_FRAMES;
        setFrame(frameRef.current);
        playingRef.current = false;
        playQueuedStep();
        return;
      }

      let remaining = WALKER_FRAMES_PER_STEP;
      const tick = () => {
        frameRef.current = nextWalkerFrame(frameRef.current);
        setFrame(frameRef.current);
        remaining -= 1;
        if (remaining > 0) {
          timerRef.current = window.setTimeout(tick, WALKER_STEP_MS / WALKER_FRAMES_PER_STEP);
          return;
        }
        playingRef.current = false;
        playQueuedStep();
      };

      timerRef.current = window.setTimeout(tick, WALKER_STEP_MS / WALKER_FRAMES_PER_STEP);
    };

    playQueuedStep();
    return undefined;
  }, [progressM, paused]);

  return { frame, stepping };
}

const WalkRiverScene = ({
  progressM = 0,
  lengthM = 5,
  direction = 'out',
  dimmed = false,
  paused = false,
}) => {
  const track = walkwayTrackPosition({ progressM, lengthM, direction });
  const goingBack = track.facing === 'start';
  const sheetSrc = goingBack ? WALKER_DOWN_SHEET : WALKER_UP_SHEET;
  const stillSrc = goingBack ? WALKER_FRONT_STILL : WALKER_BACK_STILL;
  const hasSheet = useImageExists(sheetSrc);
  const { frame, stepping } = useWalkPose(progressM, paused);
  const meters = Math.min(lengthM, Math.max(0, progressM));

  return (
    <div
      className={`walk-track ${dimmed ? 'is-dimmed' : ''} ${paused ? 'is-paused' : ''}`}
      role="img"
      aria-label={`ทางเดิน ${lengthM} เมตร ตอนนี้อยู่ที่ ${meters.toFixed(1)} เมตร ${
        direction === 'back' ? 'กำลังเดินกลับ' : 'กำลังเดินไปจุดกลับตัว'
      }`}
    >
      <div className="walk-track__garden" aria-hidden="true" />

      <div className="walk-track__path" aria-hidden="true">
        <div
          className={`walk-track__walker ${hasSheet ? 'is-sheet' : 'is-still'} ${
            !hasSheet && stepping ? 'is-stepping' : ''
          }`}
          style={{
            bottom: `${track.bottomPercent}%`,
            '--walk-scale': track.scale,
            '--walk-frame': frame,
            backgroundImage: hasSheet ? `url(${sheetSrc})` : undefined,
          }}
        >
          {hasSheet ? null : <img src={stillSrc} alt="" draggable="false" />}
        </div>
      </div>
    </div>
  );
};

export default WalkRiverScene;
