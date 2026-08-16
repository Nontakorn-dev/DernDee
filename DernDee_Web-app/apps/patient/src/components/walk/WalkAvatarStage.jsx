import React, { useEffect, useLayoutEffect, useRef } from 'react';
import {
  AVATAR_CLIPS,
  avatarNeedsCanvasKey,
  getAvatarVideoSrc,
} from './avatarClips.js';

const MAX_KEY_WIDTH = 800;
const HARD_WHITE = 249;
const CHROMA_LIMIT = 10;
const SOFT_WHITE = 250;
const SUBJECT_GROW_PX = 2;

function channelMin(red, green, blue) {
  return red < green ? (red < blue ? red : blue) : (green < blue ? green : blue);
}

function channelMax(red, green, blue) {
  return red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
}

function keyStudioWhite(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const background = new Uint8Array(pixelCount);
  const queueX = new Int32Array(pixelCount);
  const queueY = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const isHardWhite = (offset) => {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    return channelMin(red, green, blue) >= HARD_WHITE
      && (channelMax(red, green, blue) - channelMin(red, green, blue)) <= CHROMA_LIMIT;
  };

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const pixelIndex = (y * width) + x;
    if (background[pixelIndex] || !isHardWhite(pixelIndex * 4)) {
      return;
    }

    background[pixelIndex] = 1;
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
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  const labels = new Int32Array(pixelCount);
  const labelSizes = [0];
  let nextLabel = 1;
  head = 0;
  tail = 0;

  const enqueueForeground = (x, y, label) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const pixelIndex = (y * width) + x;
    if (background[pixelIndex] || labels[pixelIndex] !== 0) {
      return;
    }

    labels[pixelIndex] = label;
    labelSizes[label] += 1;
    queueX[tail] = x;
    queueY[tail] = y;
    tail += 1;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width) + x;
      if (background[pixelIndex] || labels[pixelIndex] !== 0) {
        continue;
      }

      const label = nextLabel;
      nextLabel += 1;
      labelSizes[label] = 0;
      head = 0;
      tail = 0;
      enqueueForeground(x, y, label);
      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head += 1;
        enqueueForeground(cx + 1, cy, label);
        enqueueForeground(cx - 1, cy, label);
        enqueueForeground(cx, cy + 1, label);
        enqueueForeground(cx, cy - 1, label);
      }
    }
  }

  let keepLabel = 0;
  let keepSize = 0;
  for (let label = 1; label < labelSizes.length; label += 1) {
    if (labelSizes[label] > keepSize) {
      keepSize = labelSizes[label];
      keepLabel = label;
    }
  }

  let alpha = new Uint8Array(pixelCount);
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    alpha[pixelIndex] = labels[pixelIndex] === keepLabel ? 255 : 0;
  }

  for (let grow = 0; grow < SUBJECT_GROW_PX; grow += 1) {
    const grown = new Uint8Array(alpha);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixelIndex = (y * width) + x;
        if (alpha[pixelIndex] === 0) {
          continue;
        }

        grown[pixelIndex - 1] = 255;
        grown[pixelIndex + 1] = 255;
        grown[pixelIndex - width] = 255;
        grown[pixelIndex + width] = 255;
      }
    }
    alpha = grown;
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (alpha[pixelIndex] === 0) {
      data[(pixelIndex * 4) + 3] = 0;
      continue;
    }

    const offset = pixelIndex * 4;
    const min = channelMin(data[offset], data[offset + 1], data[offset + 2]);
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const atEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      || alpha[pixelIndex - 1] === 0
      || alpha[pixelIndex + 1] === 0
      || alpha[pixelIndex - width] === 0
      || alpha[pixelIndex + width] === 0;

    data[offset + 3] = atEdge && min >= SOFT_WHITE ? 220 : 255;
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
    const scratch = document.createElement('canvas');
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true, alpha: true });

    const isDecoderBlackFrame = (imageData) => {
      const { data, width, height } = imageData;
      const samples = [
        0,
        (width - 1) * 4,
        ((height - 1) * width) * 4,
        (((height - 1) * width) + width - 1) * 4,
        (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4,
      ];
      const luma = samples.reduce((sum, offset) => (
        sum + data[offset] + data[offset + 1] + data[offset + 2]
      ), 0) / (samples.length * 3);
      return luma < 32;
    };

    const drawFrame = () => {
      if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
        if (!video.paused && !video.ended) {
          frameId = window.requestAnimationFrame(drawFrame);
        }
        return;
      }

      const scale = Math.min(1, MAX_KEY_WIDTH / video.videoWidth);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));

      if (scratch.width !== width || scratch.height !== height) {
        scratch.width = width;
        scratch.height = height;
      }

      scratchContext.drawImage(video, 0, 0, width, height);
      const imageData = scratchContext.getImageData(0, 0, width, height);
      if (isDecoderBlackFrame(imageData)) {
        if (!video.paused && !video.ended) {
          frameId = window.requestAnimationFrame(drawFrame);
        }
        return;
      }

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

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
          style={{ backgroundColor: 'transparent' }}
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
