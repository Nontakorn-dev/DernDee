import React, { useEffect, useLayoutEffect, useRef } from 'react';
import {
  AVATAR_CLIPS,
  avatarNeedsCanvasKey,
  getAvatarVideoSrc,
} from './avatarClips.js';

const MAX_KEY_WIDTH = 640;
const HARD_WHITE = 244;
const CHROMA_LIMIT = 14;

function keyStudioWhite(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const seen = new Uint8Array(pixelCount);
  const queueX = new Int32Array(pixelCount);
  const queueY = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const isStudioWhite = (offset) => {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const min = red < green ? (red < blue ? red : blue) : (green < blue ? green : blue);
    const max = red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
    return min >= HARD_WHITE && (max - min) <= CHROMA_LIMIT;
  };

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const pixelIndex = (y * width) + x;
    if (seen[pixelIndex]) {
      return;
    }

    if (!isStudioWhite(pixelIndex * 4)) {
      return;
    }

    seen[pixelIndex] = 1;
    queueX[tail] = x;
    queueY[tail] = y;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const x = queueX[head];
    const y = queueY[head];
    head += 1;
    data[(((y * width) + x) * 4) + 3] = 0;
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }
}

const WalkAvatarStage = ({
  clipId = 'idle',
  paused = false,
  isListening = false,
  subtitle = '',
  onEnded,
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const clip = AVATAR_CLIPS[clipId] ?? AVATAR_CLIPS.idle;
  const speaking = clipId !== 'idle';
  const useCanvasKey = avatarNeedsCanvasKey();
  const videoSrc = getAvatarVideoSrc(clip);

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

    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }

    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleEnded);
    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleEnded);
    };
  }, [clip.loop, clipId, onEnded, videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (paused) {
      video.pause();
      return;
    }

    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
  }, [paused]);

  useEffect(() => {
    if (!useCanvasKey) {
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

    const drawFrame = () => {
      if (!video.videoWidth || !video.videoHeight) {
        frameId = window.requestAnimationFrame(drawFrame);
        return;
      }

      const scale = Math.min(1, MAX_KEY_WIDTH / video.videoWidth);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(video, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      keyStudioWhite(imageData);
      context.putImageData(imageData, 0, 0);

      if (!video.paused && !video.ended) {
        frameId = window.requestAnimationFrame(drawFrame);
      }
    };

    const startDrawing = () => {
      window.cancelAnimationFrame(frameId);
      drawFrame();
    };

    video.addEventListener('play', startDrawing);
    video.addEventListener('loadeddata', startDrawing);
    video.addEventListener('seeked', startDrawing);
    startDrawing();

    return () => {
      window.cancelAnimationFrame(frameId);
      video.removeEventListener('play', startDrawing);
      video.removeEventListener('loadeddata', startDrawing);
      video.removeEventListener('seeked', startDrawing);
    };
  }, [useCanvasKey, videoSrc]);

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
          : 'relative z-10 h-full w-full bg-transparent object-contain'}
        playsInline
        preload="auto"
        muted={clip.loop}
      />

      {useCanvasKey ? (
        <canvas
          ref={canvasRef}
          className="relative z-10 h-full w-full bg-transparent object-contain"
        />
      ) : null}

      {subtitle ? (
        <p className="pointer-events-none absolute bottom-2 z-20 max-w-[22rem] rounded-full bg-white/85 px-4 py-1.5 text-center text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm sm:bottom-3 sm:text-base">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
};

export default WalkAvatarStage;
