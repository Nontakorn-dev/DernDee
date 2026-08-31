import React, { useEffect, useLayoutEffect, useRef } from 'react';
import {
  AVATAR_CLIPS,
  avatarNeedsCanvasKey,
  getAvatarVideoSrc,
} from './avatarClips.js';

const MAX_PACKED_WIDTH = 960;
const AVATAR_FRAME_W = 1280;
const AVATAR_FRAME_H = 704;
const MEDIA_SHOW = 'absolute inset-0 z-10 h-full w-full bg-transparent object-contain object-center';
const MEDIA_HIDE = 'absolute inset-0 z-0 h-full w-full bg-transparent object-contain object-center opacity-0 invisible [clip-path:inset(100%)]';

function applyPackedAlpha(packedImageData) {
  const packedWidth = packedImageData.width;
  const height = packedImageData.height;
  const colorWidth = Math.floor(packedWidth / 2);
  const source = packedImageData.data;
  const output = new ImageData(colorWidth, height);
  const dest = output.data;

  for (let y = 0; y < height; y += 1) {
    const row = y * packedWidth;
    for (let x = 0; x < colorWidth; x += 1) {
      const colorOffset = (row + x) * 4;
      const maskOffset = (row + x + colorWidth) * 4;
      const destOffset = ((y * colorWidth) + x) * 4;
      dest[destOffset] = source[colorOffset];
      dest[destOffset + 1] = source[colorOffset + 1];
      dest[destOffset + 2] = source[colorOffset + 2];
      dest[destOffset + 3] = source[maskOffset];
    }
  }

  return output;
}

function usePackedAlphaDraw(videoRef, canvasRef, enabled, videoSrc) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return undefined;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
    if (!context) {
      return undefined;
    }

    if (!canvas.width || !canvas.height) {
      canvas.width = AVATAR_FRAME_W;
      canvas.height = AVATAR_FRAME_H;
    }

    let rafId = 0;
    let vfcId = 0;
    let stopped = false;
    const scratch = document.createElement('canvas');
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true, alpha: true });
    const canVfc = typeof video.requestVideoFrameCallback === 'function';

    const cancelDraw = () => {
      window.cancelAnimationFrame(rafId);
      if (vfcId && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(vfcId);
      }
      rafId = 0;
      vfcId = 0;
    };

    const isDecoderBlackFrame = (imageData) => {
      const { data, width, height } = imageData;
      const colorWidth = Math.floor(width / 2);
      const samples = [
        (Math.floor(height * 0.45) * width + Math.floor(colorWidth * 0.5)) * 4,
        (Math.floor(height * 0.55) * width + Math.floor(colorWidth * 0.48)) * 4,
        (Math.floor(height * 0.35) * width + Math.floor(colorWidth * 0.52)) * 4,
      ];
      const luma = samples.reduce((sum, offset) => (
        sum + data[offset] + data[offset + 1] + data[offset + 2]
      ), 0) / (samples.length * 3);
      return luma < 16;
    };

    const drawOnce = () => {
      if (!scratchContext || video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
        return;
      }

      const scale = Math.min(1, MAX_PACKED_WIDTH / video.videoWidth);
      const width = Math.max(2, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const colorWidth = Math.floor(width / 2);

      if (scratch.width !== width || scratch.height !== height) {
        scratch.width = width;
        scratch.height = height;
      }

      scratchContext.drawImage(video, 0, 0, width, height);
      const packed = scratchContext.getImageData(0, 0, width, height);
      if (isDecoderBlackFrame(packed)) {
        return;
      }

      const framed = applyPackedAlpha(packed);
      if (canvas.width !== colorWidth || canvas.height !== height) {
        canvas.width = colorWidth;
        canvas.height = height;
      }

      context.putImageData(framed, 0, 0);
    };

    const schedule = () => {
      if (stopped) return;
      cancelDraw();
      if (canVfc) {
        vfcId = video.requestVideoFrameCallback(() => {
          drawOnce();
          if (!stopped && !video.paused && !video.ended) schedule();
        });
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        drawOnce();
        if (!stopped && !video.paused && !video.ended) schedule();
      });
    };

    video.addEventListener('play', schedule);
    video.addEventListener('playing', schedule);
    video.addEventListener('loadeddata', schedule);
    video.addEventListener('seeked', schedule);
    schedule();

    return () => {
      stopped = true;
      cancelDraw();
      video.removeEventListener('play', schedule);
      video.removeEventListener('playing', schedule);
      video.removeEventListener('loadeddata', schedule);
      video.removeEventListener('seeked', schedule);
    };
  }, [canvasRef, enabled, videoRef, videoSrc]);
}

function mediaClass(useCanvasKey, visible) {
  if (useCanvasKey) {
    return 'pointer-events-none absolute h-px w-px opacity-0';
  }

  return visible ? MEDIA_SHOW : MEDIA_HIDE;
}

function canvasClass(visible) {
  return visible ? MEDIA_SHOW : MEDIA_HIDE;
}

function LoopingMouthLayer({
  videoRef,
  canvasRef,
  src,
  visible,
  paused,
  playbackRate = 1,
  useCanvasKey,
}) {
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.playbackRate = playbackRate;

    if (video.getAttribute('src') !== src) {
      video.src = src;
      video.load();
    }

    if (paused) {
      video.pause();
      return;
    }

    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
  }, [paused, playbackRate, src, videoRef]);

  usePackedAlphaDraw(videoRef, canvasRef, useCanvasKey && visible, src);

  return (
    <>
      <video
        ref={videoRef}
        className={mediaClass(useCanvasKey, visible)}
        width={AVATAR_FRAME_W}
        height={AVATAR_FRAME_H}
        playsInline
        preload="auto"
        muted
        loop
      />
      {useCanvasKey ? (
        <canvas
          ref={canvasRef}
          className={canvasClass(visible)}
          width={AVATAR_FRAME_W}
          height={AVATAR_FRAME_H}
          style={{ backgroundColor: 'transparent', objectFit: 'contain', objectPosition: 'center' }}
        />
      ) : null}
    </>
  );
}

const WalkAvatarStage = ({
  clipId = 'idle',
  paused = false,
  isListening = false,
  lipSyncActive = false,
  mouthTalking = false,
  mouthPaceRef = null,
  subtitle = '',
  onEnded,
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mouthIdleVideoRef = useRef(null);
  const mouthIdleCanvasRef = useRef(null);
  const mouthTalkVideoRef = useRef(null);
  const mouthTalkCanvasRef = useRef(null);
  const clip = AVATAR_CLIPS[clipId] ?? AVATAR_CLIPS.idle;
  const speaking = clipId !== 'idle' || lipSyncActive;
  const useCanvasKey = avatarNeedsCanvasKey();
  const videoSrc = getAvatarVideoSrc(clip);
  const mouthIdleSrc = getAvatarVideoSrc(AVATAR_CLIPS.mouthIdle);
  const mouthTalkSrc = getAvatarVideoSrc(AVATAR_CLIPS.mouthTalk);
  const showGait = !lipSyncActive;
  const showMouthIdle = lipSyncActive && !mouthTalking;
  const showMouthTalk = lipSyncActive && mouthTalking;

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return undefined;
    }

    const handleEnded = () => {
      if (!clip.loop) {
        onEnded?.(clipId);
      }
    };

    video.loop = Boolean(clip.loop);
    video.muted = Boolean(clip.loop);
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    if (video.getAttribute('src') !== videoSrc) {
      video.src = videoSrc;
      video.load();
    }

    if (paused || lipSyncActive) {
      video.pause();
    } else {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    }

    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleEnded);
    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleEnded);
    };
  }, [clip.loop, clipId, lipSyncActive, onEnded, paused, videoSrc]);

  useEffect(() => {
    const talkVideo = mouthTalkVideoRef.current;
    if (!talkVideo) {
      return undefined;
    }

    talkVideo.playbackRate = lipSyncActive ? 0.7 : 1;
    return undefined;
  }, [lipSyncActive, mouthPaceRef]);

  usePackedAlphaDraw(videoRef, canvasRef, useCanvasKey && showGait, videoSrc);

  return (
    <div className="relative flex h-full w-full min-h-[180px] max-h-[min(52vh,440px)] flex-col items-center justify-center">
      {(speaking || isListening) && (
        <>
          <span className="pointer-events-none absolute inset-x-[18%] top-[8%] h-[70%] rounded-full bg-emerald-200/25 blur-3xl" />
          <span className="pointer-events-none absolute inset-x-[22%] top-[14%] h-[58%] rounded-full bg-cyan-200/20 blur-2xl" />
        </>
      )}

      <video
        ref={videoRef}
        className={mediaClass(useCanvasKey, showGait)}
        width={AVATAR_FRAME_W}
        height={AVATAR_FRAME_H}
        playsInline
        preload="auto"
        muted={clip.loop || lipSyncActive}
      />

      {useCanvasKey ? (
        <canvas
          ref={canvasRef}
          className={canvasClass(showGait)}
          width={AVATAR_FRAME_W}
          height={AVATAR_FRAME_H}
          style={{ backgroundColor: 'transparent', objectFit: 'contain', objectPosition: 'center' }}
        />
      ) : null}

      <LoopingMouthLayer
        videoRef={mouthIdleVideoRef}
        canvasRef={mouthIdleCanvasRef}
        src={mouthIdleSrc}
        visible={showMouthIdle}
        paused={paused}
        useCanvasKey={useCanvasKey}
      />
      <LoopingMouthLayer
        videoRef={mouthTalkVideoRef}
        canvasRef={mouthTalkCanvasRef}
        src={mouthTalkSrc}
        visible={showMouthTalk}
        paused={paused}
        playbackRate={lipSyncActive ? 0.7 : 1}
        useCanvasKey={useCanvasKey}
      />

      {subtitle ? (
        <p className="pointer-events-none absolute bottom-2 z-20 max-w-[22rem] rounded-full bg-white/85 px-4 py-1.5 text-center text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm sm:bottom-3 sm:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
};

export default WalkAvatarStage;
