import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AVATAR_CLIPS,
  avatarNeedsCanvasKey,
  getAvatarVideoSrc,
} from './avatarClips.js';

const MAX_PACKED_WIDTH = 1600;
const AVATAR_FRAME_W = 1280;
const AVATAR_FRAME_H = 704;
const CROSSFADE_MS = 180;
const FRAME_WAIT_MS = 1200;
const MEDIA_BASE = 'absolute inset-0 h-full w-full bg-transparent object-contain object-center';

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

function isPackedFrame(width, height) {
  return width / Math.max(1, height) >= 2.4;
}

function prepareVideo(video, muted = true) {
  if (!video) {
    return;
  }

  video.muted = muted;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  if (muted) {
    video.setAttribute('muted', '');
  } else {
    video.removeAttribute('muted');
  }
}

function waitForPaintedFrame(video) {
  return new Promise((resolve) => {
    let settled = false;
    let paints = 0;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(paints > 0 && Boolean(video.videoWidth));
    };

    const timeoutId = window.setTimeout(finish, FRAME_WAIT_MS);

    const onPaint = () => {
      paints += 1;
      if (paints < 2 && typeof video.requestVideoFrameCallback === 'function' && !video.seeking) {
        video.requestVideoFrameCallback(onPaint);
        return;
      }
      window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
    };

    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(onPaint);
      return;
    }

    video.addEventListener('playing', onPaint, { once: true });
  });
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
    let drawing = false;
    let lastDrawAt = 0;
    const scratch = document.createElement('canvas');
    const framedScratch = document.createElement('canvas');
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true, alpha: true });
    const framedContext = framedScratch.getContext('2d', { willReadFrequently: true, alpha: true });
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
      if (drawing || stopped) return;
      const now = performance.now();
      if (now - lastDrawAt < 33) return;
        if (!scratchContext || !framedContext || video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
          return;
        }

      drawing = true;
      lastDrawAt = now;
      try {
        if (!isPackedFrame(video.videoWidth, video.videoHeight)) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          return;
        }

        const scale = Math.min(1, MAX_PACKED_WIDTH / video.videoWidth);
        const width = Math.max(2, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));

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
        if (framedScratch.width !== framed.width || framedScratch.height !== framed.height) {
          framedScratch.width = framed.width;
          framedScratch.height = framed.height;
        }
        framedContext.putImageData(framed, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(framedScratch, 0, 0, canvas.width, canvas.height);
      } finally {
        drawing = false;
      }
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

function Slot({
  videoRef,
  canvasRef,
  src,
  opacity,
  zIndex,
  useCanvasKey,
}) {
  usePackedAlphaDraw(videoRef, canvasRef, useCanvasKey && Boolean(src), src);

  return (
    <>
      <video
        ref={videoRef}
        className={useCanvasKey ? 'pointer-events-none absolute h-px w-px opacity-0' : MEDIA_BASE}
        style={useCanvasKey ? undefined : { opacity, zIndex, backgroundColor: 'transparent' }}
        width={AVATAR_FRAME_W}
        height={AVATAR_FRAME_H}
        playsInline
        preload="auto"
      />
      {useCanvasKey ? (
        <canvas
          ref={canvasRef}
          className={MEDIA_BASE}
          width={AVATAR_FRAME_W}
          height={AVATAR_FRAME_H}
          style={{
            opacity,
            zIndex,
            backgroundColor: 'transparent',
            objectFit: 'contain',
            objectPosition: 'center',
          }}
        />
      ) : null}
    </>
  );
}

function CrossfadeStage({
  src,
  loop,
  paused,
  useCanvasKey,
  onEnded,
}) {
  const videoARef = useRef(null);
  const videoBRef = useRef(null);
  const canvasARef = useRef(null);
  const canvasBRef = useRef(null);
  const frontRef = useRef(0);
  const activeSrcRef = useRef('');
  const requestIdRef = useRef(0);
  const fadeRafRef = useRef(0);
  const [slotSrc, setSlotSrc] = useState(['', '']);
  const [opacities, setOpacities] = useState([0, 0]);
  const [zIndexes, setZIndexes] = useState([2, 1]);

  useEffect(() => {
    const warm = document.createElement('video');
    warm.muted = true;
    warm.preload = 'auto';
    warm.playsInline = true;
    warm.src = getAvatarVideoSrc(AVATAR_CLIPS.talkSmall);
    warm.load();
  }, []);

  useLayoutEffect(() => {
    const videos = [videoARef.current, videoBRef.current];
    videos.forEach((video) => prepareVideo(video, true));

    const cancelFade = () => {
      window.cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = 0;
    };

    const applyFrontAudio = (video) => {
      prepareVideo(video, Boolean(loop) || paused);
    };

    const front = frontRef.current;
    const frontVideo = videos[front];

    videos.forEach((video, index) => {
      if (video) {
        video.loop = Boolean(loop) && index === front;
      }
    });

    if (paused) {
      if (activeSrcRef.current === src) {
        videos.forEach((video) => {
          video?.pause();
          prepareVideo(video, true);
        });
        return () => cancelFade();
      }

      const stillIndex = activeSrcRef.current ? front : 0;
      const stillVideo = videos[stillIndex];
      if (!stillVideo) {
        return () => cancelFade();
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      stillVideo.loop = Boolean(loop);
      prepareVideo(stillVideo, true);
      if (stillVideo.getAttribute('src') !== src) {
        stillVideo.src = src;
        stillVideo.load();
      }
      setSlotSrc((previous) => {
        const next = [...previous];
        next[stillIndex] = src;
        return next;
      });

      const playPromise = stillVideo.play();
      playPromise?.catch?.(() => {});
      void waitForPaintedFrame(stillVideo).then((ready) => {
        if (requestIdRef.current !== requestId || !ready) {
          return;
        }
        stillVideo.pause();
        frontRef.current = stillIndex;
        activeSrcRef.current = src;
        setOpacities(stillIndex === 0 ? [1, 0] : [0, 1]);
        setZIndexes(stillIndex === 0 ? [2, 1] : [1, 2]);
      });
      return () => cancelFade();
    }

    if (activeSrcRef.current === src && frontVideo) {
      frontVideo.loop = Boolean(loop);
      applyFrontAudio(frontVideo);
      const playPromise = frontVideo.play();
      playPromise?.catch?.(() => {});
      return () => cancelFade();
    }

    const incomingIndex = activeSrcRef.current ? 1 - front : front;
    const incoming = videos[incomingIndex];
    if (!incoming) {
      return () => cancelFade();
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    incoming.loop = Boolean(loop);
    prepareVideo(incoming, true);

    if (incoming.getAttribute('src') !== src) {
      incoming.src = src;
      incoming.load();
    }

    try {
      incoming.currentTime = 0;
    } catch {
      // decoder may not be ready yet
    }

    setSlotSrc((previous) => {
      const next = [...previous];
      next[incomingIndex] = src;
      return next;
    });

    const finishSwap = () => {
      if (incomingIndex !== front) {
        videos[front]?.pause();
        prepareVideo(videos[front], true);
        frontRef.current = incomingIndex;
      }
      incoming.loop = Boolean(loop);
      applyFrontAudio(incoming);
      activeSrcRef.current = src;
      setOpacities(incomingIndex === 0 ? [1, 0] : [0, 1]);
      setZIndexes(incomingIndex === 0 ? [2, 1] : [1, 2]);
    };

    const startCover = () => {
      if (!activeSrcRef.current || incomingIndex === front) {
        finishSwap();
        return;
      }

      if (!loop) {
        applyFrontAudio(incoming);
      }

      const startedAt = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - startedAt) / CROSSFADE_MS);
        const eased = t * t * (3 - 2 * t);
        const next = [0, 0];
        next[front] = 1;
        next[incomingIndex] = eased;
        setOpacities(next);
        setZIndexes(incomingIndex === 0 ? [3, 2] : [2, 3]);
        if (t < 1) {
          fadeRafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        finishSwap();
      };
      cancelFade();
      fadeRafRef.current = window.requestAnimationFrame(tick);
    };

    const playPromise = incoming.play();
    playPromise?.catch?.(() => {});

    void waitForPaintedFrame(incoming).then((ready) => {
      if (requestIdRef.current !== requestId || !ready) {
        return;
      }
      startCover();
    });

    return () => {
      cancelFade();
    };
  }, [loop, paused, src]);

  useEffect(() => {
    const frontVideo = frontRef.current === 0 ? videoARef.current : videoBRef.current;
    if (!frontVideo || loop) {
      return undefined;
    }

    const handleEnded = () => onEnded?.();
    frontVideo.addEventListener('ended', handleEnded);
    frontVideo.addEventListener('error', handleEnded);
    return () => {
      frontVideo.removeEventListener('ended', handleEnded);
      frontVideo.removeEventListener('error', handleEnded);
    };
  }, [loop, onEnded, src, opacities]);

  return (
    <>
      <Slot
        videoRef={videoARef}
        canvasRef={canvasARef}
        src={slotSrc[0]}
        opacity={opacities[0]}
        zIndex={zIndexes[0]}
        useCanvasKey={useCanvasKey}
      />
      <Slot
        videoRef={videoBRef}
        canvasRef={canvasBRef}
        src={slotSrc[1]}
        opacity={opacities[1]}
        zIndex={zIndexes[1]}
        useCanvasKey={useCanvasKey}
      />
    </>
  );
}

const WalkAvatarStage = ({
  clipId = 'idle',
  paused = false,
  isListening = false,
  talking = false,
  subtitle = '',
  onEnded,
}) => {
  const clip = talking
    ? AVATAR_CLIPS.talkSmall
    : (AVATAR_CLIPS[clipId] ?? AVATAR_CLIPS.idle);
  const useCanvasKey = avatarNeedsCanvasKey();
  const videoSrc = getAvatarVideoSrc(clip);
  const speaking = clipId !== 'idle' || talking;

  return (
    <div className="relative flex h-full w-full min-h-[180px] max-h-[min(52vh,440px)] flex-col items-center justify-center">
      {(speaking || isListening) && (
        <>
          <span className="pointer-events-none absolute inset-x-[18%] top-[8%] h-[70%] rounded-full bg-emerald-200/25 blur-3xl" />
          <span className="pointer-events-none absolute inset-x-[22%] top-[14%] h-[58%] rounded-full bg-cyan-200/20 blur-2xl" />
        </>
      )}

      <CrossfadeStage
        src={videoSrc}
        loop={Boolean(clip.loop)}
        paused={paused}
        useCanvasKey={useCanvasKey}
        onEnded={() => onEnded?.(clipId)}
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
