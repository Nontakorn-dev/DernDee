import React, { useEffect, useLayoutEffect, useRef } from 'react';
import {
  AVATAR_CLIPS,
  avatarNeedsCanvasKey,
  getAvatarVideoSrc,
} from './avatarClips.js';

const MAX_PACKED_WIDTH = 1600;

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

    let frameId = 0;
    const scratch = document.createElement('canvas');
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true, alpha: true });

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

    const drawFrame = () => {
      if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
        if (!video.paused && !video.ended) {
          frameId = window.requestAnimationFrame(drawFrame);
        }
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
        if (!video.paused && !video.ended) {
          frameId = window.requestAnimationFrame(drawFrame);
        }
        return;
      }

      const framed = applyPackedAlpha(packed);
      if (canvas.width !== colorWidth || canvas.height !== height) {
        canvas.width = colorWidth;
        canvas.height = height;
      }

      context.putImageData(framed, 0, 0);

      if (!video.paused && !video.ended) {
        frameId = window.requestAnimationFrame(drawFrame);
      }
    };

    const startDrawing = () => {
      window.cancelAnimationFrame(frameId);
      drawFrame();
    };

    video.addEventListener('play', startDrawing);
    video.addEventListener('playing', startDrawing);
    video.addEventListener('loadeddata', startDrawing);
    video.addEventListener('seeked', startDrawing);
    startDrawing();

    return () => {
      window.cancelAnimationFrame(frameId);
      video.removeEventListener('play', startDrawing);
      video.removeEventListener('playing', startDrawing);
      video.removeEventListener('loadeddata', startDrawing);
      video.removeEventListener('seeked', startDrawing);
    };
  }, [canvasRef, enabled, videoRef, videoSrc]);
}

function LoopingAvatarVideo({
  videoRef,
  canvasRef,
  src,
  visible,
  paused = false,
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
  }, [paused, src, videoRef]);

  usePackedAlphaDraw(videoRef, canvasRef, useCanvasKey, src);

  const hiddenClass = useCanvasKey
    ? 'pointer-events-none absolute h-px w-px opacity-0'
    : 'absolute inset-0 z-10 h-full w-full bg-transparent object-contain transition-opacity duration-75';

  return (
    <>
      <video
        ref={videoRef}
        className={useCanvasKey ? hiddenClass : `${hiddenClass} ${visible ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        preload="auto"
        muted
        loop
      />
      {useCanvasKey ? (
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 z-10 h-full w-full bg-transparent object-contain transition-opacity duration-75 ${visible ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundColor: 'transparent' }}
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
  mouthOpen = false,
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
    video.src = videoSrc;
    video.load();

    if (!lipSyncActive) {
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
  }, [clip.loop, clipId, lipSyncActive, onEnded, videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (paused || lipSyncActive) {
      video.pause();
      return;
    }

    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
  }, [lipSyncActive, paused]);

  usePackedAlphaDraw(videoRef, canvasRef, useCanvasKey && !lipSyncActive, videoSrc);

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
        className={useCanvasKey
          ? 'pointer-events-none absolute h-px w-px opacity-0'
          : `relative z-10 h-full w-full bg-transparent object-contain ${lipSyncActive ? 'hidden' : ''}`}
        playsInline
        preload="auto"
        muted={clip.loop || lipSyncActive}
      />

      {useCanvasKey && !lipSyncActive ? (
        <canvas
          ref={canvasRef}
          className="relative z-10 h-full w-full bg-transparent object-contain"
          style={{ backgroundColor: 'transparent' }}
        />
      ) : null}

      <div className={`absolute inset-0 z-10 ${lipSyncActive ? '' : 'pointer-events-none'}`}>
        <LoopingAvatarVideo
          videoRef={mouthIdleVideoRef}
          canvasRef={mouthIdleCanvasRef}
          src={mouthIdleSrc}
          visible={lipSyncActive && !mouthOpen}
          paused={paused || !lipSyncActive}
          useCanvasKey={useCanvasKey}
        />
        <LoopingAvatarVideo
          videoRef={mouthTalkVideoRef}
          canvasRef={mouthTalkCanvasRef}
          src={mouthTalkSrc}
          visible={lipSyncActive && mouthOpen}
          paused={paused || !lipSyncActive}
          useCanvasKey={useCanvasKey}
        />
      </div>

      {subtitle ? (
        <p className="pointer-events-none absolute bottom-2 z-20 max-w-[22rem] rounded-full bg-white/85 px-4 py-1.5 text-center text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm sm:bottom-3 sm:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
};

export default WalkAvatarStage;
