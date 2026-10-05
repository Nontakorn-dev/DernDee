const CHARGE_RATE = 14;
const DECAY_RATE = 16;

export const CLINICAL_EXERCISES = [
  {
    id: 'dorsiflexor',
    order: 1,
    title: 'กระดกข้อเท้า',
    summary: 'กระดกข้อเท้าขึ้นค้างไว้จนถึงเป้าหมาย แล้วเดินต่อ',
  },
  {
    id: 'plantarflexor',
    order: 2,
    title: 'กดปลายเท้า',
    summary: 'กดปลายเท้าลงค้างไว้จนถึงเป้าหมาย แล้วเดินต่อ',
  },
  {
    id: 'hip-flexor',
    order: 3,
    title: 'ยกเข่า',
    summary: 'ยกเข่าขึ้นค้างไว้จนถึงเป้าหมาย แล้วเดินต่อ',
  },
  {
    id: 'combined',
    order: 4,
    title: 'ฝึกต่อเนื่อง',
    summary: 'สลับกระดกข้อเท้า กดปลายเท้า และยกเข่า ตามลำดับ',
  },
];

export const POSE_COPY = {
  duck: {
    title: 'กระดกข้อเท้า',
    action: 'กระดกข้อเท้าขึ้น',
  },
  boost: {
    title: 'กดปลายเท้า',
    action: 'กดปลายเท้าลง',
  },
  jump: {
    title: 'ยกเข่า',
    action: 'ยกเข่าขึ้น',
  },
};

export function poseSequence(chapter, reps, kit = 'full') {
  const count = Math.max(1, Number(reps) || 1);
  if (chapter === 'plantarflexor') return Array(count).fill('boost');
  if (chapter === 'hip-flexor') return Array(count).fill('jump');
  if (chapter === 'dorsiflexor') return Array(count).fill('duck');
  const mix = kit === 'ankle' ? ['duck', 'boost'] : ['duck', 'boost', 'jump'];
  return Array.from({ length: count }, (_, index) => mix[index % mix.length]);
}

export function createClinicalSession({ targetAngle, walkSeconds, poses }) {
  return {
    phase: 'hold',
    index: 0,
    poses,
    angle: 0,
    targetAngle,
    walkLeft: walkSeconds,
    walkSeconds,
  };
}

export function tickClinical(session, dt, input) {
  if (!session || session.phase === 'done') return session;

  if (session.phase === 'walk') {
    const walkLeft = Math.max(0, session.walkLeft - dt);
    if (walkLeft > 0) {
      return walkLeft === session.walkLeft ? session : { ...session, walkLeft, angle: 0 };
    }
    return {
      ...session,
      phase: 'hold',
      index: session.index + 1,
      angle: 0,
      walkLeft: session.walkSeconds,
    };
  }

  let angle = session.angle;
  if (input.mode === 'live') {
    const live = input.liveAngle;
    if (Number.isFinite(live)) {
      angle = Math.max(0, Math.min(session.targetAngle + 12, live));
    } else {
      angle = Math.max(0, angle - DECAY_RATE * dt);
    }
  } else if (input.holding) {
    angle = Math.min(session.targetAngle + 10, angle + CHARGE_RATE * dt);
  } else {
    angle = 0;
  }

  if (angle >= session.targetAngle) {
    const last = session.index >= session.poses.length - 1;
    if (last) {
      return { ...session, angle: session.targetAngle, phase: 'done' };
    }
    return {
      ...session,
      angle: 0,
      phase: 'walk',
      walkLeft: session.walkSeconds,
    };
  }

  if (angle === session.angle) return session;
  return { ...session, angle };
}

export function clinicalMenuPath(search = '') {
  const params = new URLSearchParams(search);
  params.delete('chapter');
  params.delete('stage');
  const query = params.toString();
  return query ? `/game/trail?${query}` : '/game/trail';
}

export function clinicalPlayPath(chapter, stage, search = '') {
  const params = new URLSearchParams(search);
  params.set('chapter', chapter);
  params.set('stage', String(stage));
  return `/play?${params.toString()}`;
}

export function animatedTrailPath(search = '') {
  const params = new URLSearchParams(search);
  params.delete('chapter');
  params.delete('stage');
  const query = params.toString();
  return query ? `/game/trail?${query}` : '/game/trail';
}
