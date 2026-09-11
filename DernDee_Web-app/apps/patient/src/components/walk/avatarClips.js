function withDeviceSources(clip) {
  // Invalidate the truncated WebM assets previously cached by browsers.
  if (/\/(14_|15_|16_|17_|18_)/.test(clip.src)) {
    clip = { ...clip, src: `${clip.src.split('?')[0]}?v=v2-turn-20260909` };
  }
  if (/\/(14_|16_|17_|18_)/.test(clip.src) && clip.inPoint == null) {
    clip = { ...clip, inPoint: SPEECH_CLIP_IN_POINT_S };
  }
  const mp4Src = clip.src.replace(/\.webm/i, '.mp4');
  return {
    ...clip,
    srcMp4: mp4Src,
    srcIos: mp4Src.replace(/\.mp4/i, '.ios.mp4'),
  };
}

/** Skip the closed-mouth rest at the start/end of TALK_SMALL. */
export const TALK_SMALL_LOOP_START_S = 1.05;
export const TALK_SMALL_LOOP_END_S = 4.65;
/** Skip the closed-mouth hold before advice clips start speaking. */
export const SPEECH_CLIP_IN_POINT_S = 0.28;

export function wrapTalkLoopTime(currentTime, start, end) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return currentTime;
  }
  return currentTime >= end ? start : currentTime;
}

export const AVATAR_CLIPS = {
  greeting: {
    id: 'greeting',
    src: '/Avatar/video/1_IDLE_PROFESSIONAL.webm?v=stepdee1',
    loop: false,
    line: 'สวัสดีครับ ผมสเต็ปดี ผู้ช่วยของคุณ',
  },
  caution: {
    id: 'caution',
    src: '/Avatar/video/2_GESTURE_CAUTION_LIFT.webm',
    loop: false,
    line: 'ระวังนะครับ ค่อยๆ ยกเท้านะ',
  },
  posture: {
    id: 'posture',
    src: '/Avatar/video/3_GESTURE_POSTURE_ALIGN.webm',
    loop: false,
    line: 'ยืดหลังให้ตรงอีกนิดนะครับ',
  },
  clearance: {
    id: 'clearance',
    src: '/Avatar/video/4_GESTURE_MIMIC_BEND.webm',
    loop: false,
    line: 'ลองยกเข่าให้สูงขึ้นแบบนี้นะครับ',
  },
  ready: {
    id: 'ready',
    src: '/Avatar/video/5_GESTURE_EXTEND_FORWARD.webm',
    loop: false,
    line: 'ผมพร้อมอยู่ตรงนี้แล้วครับ มาเริ่มกันเลย',
  },
  energy: {
    id: 'energy',
    src: '/Avatar/video/6_GESTURE_HURRY_ROLL.webm',
    loop: false,
    line: 'เดินให้กระฉับกระเฉงขึ้นอีกนิดนะครับ',
  },
  rhythm: {
    id: 'rhythm',
    src: '/Avatar/video/7_GESTURE_CONDUCTOR.webm',
    loop: false,
    line: 'เดินตามจังหวะนี้ไปด้วยกันนะครับ',
  },
  balance: {
    id: 'balance',
    src: '/Avatar/video/8_GESTURE_BALANCE_SCALES.webm',
    loop: false,
    line: 'ทรงตัวให้นิ่งๆ สองข้างเท่ากันนะครับ',
  },
  praise: {
    id: 'praise',
    src: '/Avatar/video/9_GESTURE_THUMBS_UP.webm',
    loop: false,
    line: 'เยี่ยมมากครับ เดินได้ดีขึ้นแล้ว',
  },
  restA: {
    id: 'restA',
    src: '/Avatar/video/12_REST_BREAK_A.webm',
    loop: false,
    line: 'ดีมากครับ พักสักครู่ก่อนก็ได้ครับ',
  },
  restB: {
    id: 'restB',
    src: '/Avatar/video/13_REST_BREAK_B.webm',
    loop: false,
    line: 'เก่งมากครับ พักสักครู่ก่อนก็ได้ครับ',
  },
  invite: {
    id: 'invite',
    src: '/Avatar/video/10_GESTURE_INVITE_WALK.webm',
    loop: false,
    line: 'พร้อมแล้วก็เริ่มเดินได้เลยนะครับ',
  },
  idle: {
    id: 'idle',
    src: '/Avatar/video/11.webm',
    loop: true,
    silent: true,
    line: '',
  },
  talkSmall: {
    id: 'talkSmall',
    src: '/Avatar/video/TALK_SMALL.webm?v=convo5',
    loop: true,
    silent: true,
    loopStart: TALK_SMALL_LOOP_START_S,
    loopEnd: TALK_SMALL_LOOP_END_S,
    line: '',
  },
  nearEnd: {
    id: 'nearEnd',
    src: '/Avatar/video/14_NEAR_END.webm',
    loop: false,
    line: 'เก่งมาก ใกล้ถึงแล้วครับ',
  },
  turnRest: {
    id: 'turnRest',
    src: '/Avatar/video/15_TURN_REST.webm',
    loop: false,
    line: 'กลับหลังหันแล้วพักก่อนได้เลยครับ',
  },
  walkwayFaster0: {
    id: 'walkwayFaster0',
    src: '/Avatar/video/16_WALKWAY_FASTER_3a1.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองเดินให้เร็วขึ้นอีกนิดนะครับ',
  },
  walkwayFaster1: {
    id: 'walkwayFaster1',
    src: '/Avatar/video/16_WALKWAY_FASTER_3a2.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองเพิ่มจังหวะอีกนิดนะครับ',
  },
  walkwayFaster2: {
    id: 'walkwayFaster2',
    src: '/Avatar/video/16_WALKWAY_FASTER_3a3.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองเดินให้คล่องขึ้นอีกหน่อยนะครับ',
  },
  walkwayLonger0: {
    id: 'walkwayLonger0',
    src: '/Avatar/video/17_WALKWAY_LONGER_STEP_3b1.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองก้าวให้ยาวขึ้นอีกหน่อยนะครับ',
  },
  walkwayLonger1: {
    id: 'walkwayLonger1',
    src: '/Avatar/video/17_WALKWAY_LONGER_STEP_3b2.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองก้าวให้กว้างขึ้นอีกนิดนะครับ',
  },
  walkwayLonger2: {
    id: 'walkwayLonger2',
    src: '/Avatar/video/17_WALKWAY_LONGER_STEP_3b3.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองเหยียดก้าวให้ยาวขึ้นนะครับ',
  },
  walkwayKeep0: {
    id: 'walkwayKeep0',
    src: '/Avatar/video/18_WALKWAY_KEEP_3c1.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองรักษาแบบนี้ต่อไปได้เลยครับ',
  },
  walkwayKeep1: {
    id: 'walkwayKeep1',
    src: '/Avatar/video/18_WALKWAY_KEEP_3c2.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองเดินสม่ำเสมอแบบนี้ต่อไปนะครับ',
  },
  walkwayKeep2: {
    id: 'walkwayKeep2',
    src: '/Avatar/video/18_WALKWAY_KEEP_3c3.webm',
    loop: false,
    line: 'เดี๋ยวตอนเดินกลับลองทำแบบนี้ต่อไปได้เลยครับ',
  },
};

Object.keys(AVATAR_CLIPS).forEach((key) => {
  AVATAR_CLIPS[key] = withDeviceSources(AVATAR_CLIPS[key]);
});

export function avatarNeedsCanvasKey() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isBluefy = /Bluefy/i.test(userAgent);
  const isWebKitWithoutChromium = /WebKit/i.test(userAgent)
    && !/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(userAgent);

  return isIos || isBluefy || isWebKitWithoutChromium;
}

export function getAvatarVideoSrc(clip) {
  if (avatarNeedsCanvasKey()) {
    return clip.srcIos || clip.srcMp4 || clip.src;
  }

  return clip.src;
}

const ALERT_TO_CLIP = {
  low_clearance: 'clearance',
  short_step: 'energy',
  slow_cadence: 'rhythm',
};

const WALKWAY_ADVICE_CLIPS = {
  faster: ['walkwayFaster0', 'walkwayFaster1', 'walkwayFaster2'],
  longer_step: ['walkwayLonger0', 'walkwayLonger1', 'walkwayLonger2'],
  keep: ['walkwayKeep0', 'walkwayKeep1', 'walkwayKeep2'],
};

export function resolveAvatarClip(dispatch) {
  if (!dispatch?.trigger) {
    return null;
  }

  if (dispatch.trigger === 'greeting') {
    return AVATAR_CLIPS.greeting;
  }

  if (dispatch.trigger === 'idle_resume') {
    return AVATAR_CLIPS.invite;
  }

  if (dispatch.trigger === 'rest_break') {
    return dispatch.snapshot?.rest_variant === 'b' ? AVATAR_CLIPS.restB : AVATAR_CLIPS.restA;
  }

  if (dispatch.trigger === 'step_improved' || dispatch.trigger === 'encouragement') {
    return AVATAR_CLIPS.praise;
  }

  if (dispatch.trigger === 'metric_alert') {
    const clipId = ALERT_TO_CLIP[dispatch.snapshot?.alert];
    return clipId ? AVATAR_CLIPS[clipId] : null;
  }

  if (dispatch.trigger === 'near_end') {
    return AVATAR_CLIPS.nearEnd;
  }

  if (dispatch.trigger === 'turn_rest') {
    return AVATAR_CLIPS.turnRest;
  }

  if (dispatch.trigger === 'walkway_advice') {
    const advice = dispatch.snapshot?.walkway_advice || 'keep';
    const variants = WALKWAY_ADVICE_CLIPS[advice] || WALKWAY_ADVICE_CLIPS.keep;
    const parsed = Number(dispatch.snapshot?.cue_variant);
    const index = Number.isFinite(parsed) ? parsed : 0;
    const clipId = variants[index % variants.length];
    return AVATAR_CLIPS[clipId] ?? AVATAR_CLIPS.walkwayKeep0;
  }

  return null;
}
