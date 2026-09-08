function withDeviceSources(clip) {
  const mp4Src = clip.src.replace(/\.webm/i, '.mp4');
  return {
    ...clip,
    srcMp4: mp4Src,
    srcIos: mp4Src.replace(/\.mp4/i, '.ios.mp4'),
  };
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
    line: '',
  },
  talkSmall: {
    id: 'talkSmall',
    src: '/Avatar/video/TALK_SMALL.webm?v=convo2',
    loop: true,
    line: '',
  },
  mouthIdle: {
    id: 'mouthIdle',
    src: '/Avatar/video/14_MOUTH_IDLE_CLOSED.webm?v=smooth1',
    loop: true,
    line: '',
  },
  mouthTalk: {
    id: 'mouthTalk',
    src: '/Avatar/video/17_MOUTH_TALK_B.webm?v=1',
    loop: true,
    line: '',
  },
  mouthTalkA: {
    id: 'mouthTalkA',
    src: '/Avatar/video/16_MOUTH_TALK_A.webm?v=1',
    loop: true,
    line: '',
  },
  mouthTalkB: {
    id: 'mouthTalkB',
    src: '/Avatar/video/17_MOUTH_TALK_B.webm?v=1',
    loop: true,
    line: '',
  },
  mouthTalkC: {
    id: 'mouthTalkC',
    src: '/Avatar/video/18_MOUTH_TALK_C.webm?v=1',
    loop: true,
    line: '',
  },
};

Object.keys(AVATAR_CLIPS).forEach((key) => {
  AVATAR_CLIPS[key] = withDeviceSources(AVATAR_CLIPS[key]);
});

export const MOUTH_TALK_CLIPS = [
  AVATAR_CLIPS.mouthTalk,
];

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

  return null;
}
