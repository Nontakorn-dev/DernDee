import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FreeWalkWalkwayTracker, selectWalkwayAdvice } from '../shared/gait/freeWalkWalkway.js'
import { walkwayStoneWindow } from '../shared/gait/walkwayStoneWindow.js'
import { walkwayLapFromLegIndex, walkwayTrackPosition } from '../shared/gait/walkwayTrackPosition.js'
import { nextWalkerFrame, queuedWalkerSteps } from '../apps/patient/src/components/walk/walkSprites.js'

function ingestYawArc(walkway, fromDeg, toDeg, startMs, endMs, samples = 8) {
  let turn = null
  for (let i = 0; i <= samples; i += 1) {
    const t = startMs + ((endMs - startMs) * i) / samples
    const yaw = fromDeg + ((toDeg - fromDeg) * i) / samples
    turn = walkway.ingestYaw(yaw, t) || turn
  }
  return turn
}

function completeAboutFace(walkway, startMs, fromDeg = 0, toDeg = 180) {
  let turn = ingestYawArc(walkway, fromDeg, toDeg, startMs, startMs + 1_200, 8)
  turn = walkway.ingestYaw(toDeg, startMs + 1_400) || turn
  turn = walkway.ingestYaw(toDeg, startMs + 1_600) || turn
  return walkway.ingestYaw(toDeg - 2, startMs + 1_900) || turn
}

test('walkway advice uses 5 m divided by steps then cadence or speed', () => {
  assert.equal(selectWalkwayAdvice({ stepLengthM: 0.35, cadenceSpm: 90, speedMps: 0.7 }), 'longer_step')
  assert.equal(selectWalkwayAdvice({ stepLengthM: 0.5, cadenceSpm: 55, speedMps: 0.46 }), 'faster')
  assert.equal(selectWalkwayAdvice({ stepLengthM: 0.5, cadenceSpm: 100, speedMps: 0.83 }), 'keep')
})

test('first-leg progress ignores noisy accel step length and locks 0.5 m', () => {
  const walkway = new FreeWalkWalkwayTracker()
  const result = walkway.ingestStep({ stepCount: 1, stepLength: 0.9 }, 1_000)
  assert.equal(result.progressM, 0.5)
  assert.equal(walkway.calibratedStepLengthM, 0.5)
})

test('near-end cue fires before the 5 m mark', () => {
  const walkway = new FreeWalkWalkwayTracker()
  let nearEnd = null
  for (let step = 1; step <= 9; step += 1) {
    const result = walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 1_000 + step)
    const hit = result.events.find((event) => event.type === 'near_end')
    if (hit) nearEnd = hit
  }

  assert.ok(nearEnd)
  assert.equal(nearEnd.progressM, 4.5)
})

test('later legs use 5 m / steps from the completed about-face', () => {
  const walkway = new FreeWalkWalkwayTracker()
  const started = 5_000
  for (let step = 1; step <= 10; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, started + (step * 600))
  }

  const lastStepAt = started + (10 * 600)
  const turn = completeAboutFace(walkway, lastStepAt + 200)
  assert.equal(turn?.type, 'turn_rest')
  assert.equal(turn.reason, 'yaw_turn')
  assert.equal(turn.steps, 10)
  assert.equal(turn.stepLengthM, 0.5)
  assert.equal(turn.strideLengthM, 1)
  assert.equal(turn.advice, 'keep')
  assert.ok(turn.cadenceSpm > 0)
  assert.ok(turn.speedMps > 0)

  const overlaid = walkway.applySpatialOverlay({ stepLength: 0.2, cadence: 100, walkingSpeed: 0.1 })
  assert.equal(overlaid.spatialSource, 'walkway_5m_temporal')
  assert.equal(overlaid.stepLength, 0.5)
})

test('reaching 5 m without a 180 turn does not play turn rest', () => {
  const walkway = new FreeWalkWalkwayTracker()
  let turn = null
  let nearEnd = null
  for (let step = 1; step <= 10; step += 1) {
    const result = walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 1_000 + step)
    const turnHit = result.events.find((event) => event.type === 'turn_rest')
    const nearHit = result.events.find((event) => event.type === 'near_end')
    if (turnHit) turn = turnHit
    if (nearHit) nearEnd = nearHit
  }

  assert.equal(turn, null)
  assert.ok(nearEnd)
  assert.equal(walkway.progressM, 5)
  assert.equal(walkway.snapshot().direction, 'out')
})

test('a step burst past 4.2 m still fires near-end', () => {
  const walkway = new FreeWalkWalkwayTracker()
  const result = walkway.ingestStep({ stepCount: 10, stepLength: 0.9 }, 1_000)
  assert.ok(result.events.some((event) => event.type === 'near_end'))
  assert.ok(!result.events.some((event) => event.type === 'turn_rest'))
  assert.equal(result.progressM, 5)
})

test('yaw 120 deg is not an about-face', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 9; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + step)
  }

  ingestYawArc(walkway, 0, 120, 3_000, 4_200, 8)
  assert.equal(walkway.ingestYaw(120, 4_500), null)
  assert.equal(walkway.progressM, 4.5)
})

test('yaw 180 deg before the flag does not complete a leg', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 6; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + step)
  }

  assert.equal(completeAboutFace(walkway, 3_000), null)
  assert.equal(walkway.progressM, 3)
})

test('one more step after near-end does not play turn rest', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 9; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + (step * 600))
    walkway.ingestYaw(0, 2_000 + (step * 600) + 40)
  }

  const lastStepAt = 2_000 + (9 * 600)
  const stride = [0, 50, 110, 165, 120, 40, 8]
  stride.forEach((yaw, index) => {
    walkway.ingestYaw(yaw, lastStepAt + 80 + (index * 90))
  })
  walkway.ingestStep({ stepCount: 10, stepLength: 0.9 }, lastStepAt + 400)
  stride.forEach((yaw, index) => {
    walkway.ingestYaw(yaw, lastStepAt + 440 + (index * 90))
  })

  assert.equal(walkway.snapshot().direction, 'out')
  assert.equal(walkway.progressM, 5)
  assert.equal(walkway.completedLegs.length, 0)
})

test('oscillating shank yaw while walking does not play turn rest', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 9; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + (step * 600))
  }

  const lastStepAt = 2_000 + (9 * 600)
  const swings = [0, 45, 10, -35, 20, -40, 15, -25, 8]
  swings.forEach((yaw, index) => {
    walkway.ingestYaw(yaw, lastStepAt + 80 + (index * 120))
  })
  walkway.ingestStep({ stepCount: 10, stepLength: 0.9 }, lastStepAt + 1_200)
  swings.forEach((yaw, index) => {
    walkway.ingestYaw(yaw, lastStepAt + 1_280 + (index * 120))
  })
  assert.equal(walkway.snapshot().direction, 'out')
  assert.equal(walkway.progressM, 5)
})

test('a heading spike that does not hold is not an about-face', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 10; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + (step * 600))
  }

  const lastStepAt = 2_000 + (10 * 600)
  walkway.ingestYaw(0, lastStepAt + 200)
  walkway.ingestYaw(180, lastStepAt + 400)
  assert.equal(walkway.ingestYaw(15, lastStepAt + 520), null)
  assert.equal(walkway.progressM, 5)
})

test('an about-face still counts when a pivot step arrives mid-turn', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 9; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + step)
  }

  ingestYawArc(walkway, 0, 90, 3_000, 3_500, 4)
  walkway.ingestStep({ stepCount: 10, stepLength: 0.9 }, 3_560)
  let turn = ingestYawArc(walkway, 90, 180, 3_620, 4_200, 4)
  turn = walkway.ingestYaw(180, 4_400) || turn
  turn = walkway.ingestYaw(178, 4_700) || turn
  turn = walkway.ingestYaw(176, 5_000) || turn
  assert.equal(turn?.type, 'turn_rest')
  assert.equal(turn.reason, 'yaw_turn')
  assert.equal(walkway.snapshot().direction, 'back')
})

test('yaw 180 deg near the flag completes a leg', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 9; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + step)
  }

  const turn = completeAboutFace(walkway, 3_000)
  assert.equal(turn?.type, 'turn_rest')
  assert.equal(turn.reason, 'yaw_turn')
  assert.equal(turn.stepLengthM, 5 / 9)
  assert.equal(walkway.progressM, 0)

  const next = walkway.ingestStep({ stepCount: 10, stepLength: 0.9 }, 5_000)
  assert.ok(Math.abs(next.progressM - (5 / 9)) < 0.001)
})

test('walkway stones keep the walker on the nearest slot and slide the path forward', () => {
  const start = walkwayStoneWindow({ progressM: 0, lengthM: 5, slotCount: 4 })
  assert.equal(start.current, 1)
  assert.deepEqual(start.numbers, [1, 2, 3, 4])

  const mid = walkwayStoneWindow({ progressM: 2.5, lengthM: 5, slotCount: 4 })
  assert.equal(mid.current, 6)
  assert.equal(mid.numbers[0], mid.current)

  const end = walkwayStoneWindow({ progressM: 5, lengthM: 5, slotCount: 4 })
  assert.equal(end.current, 10)
  assert.ok(end.numbers.includes(10))
})

test('walkway track sprite moves up on the way out and down on the way back', () => {
  const start = walkwayTrackPosition({ progressM: 0, lengthM: 5, direction: 'out' })
  const mid = walkwayTrackPosition({ progressM: 2.5, lengthM: 5, direction: 'out' })
  const turn = walkwayTrackPosition({ progressM: 0, lengthM: 5, direction: 'back' })
  const home = walkwayTrackPosition({ progressM: 5, lengthM: 5, direction: 'back' })

  assert.equal(start.facing, 'turn')
  assert.ok(start.along < mid.along)
  assert.ok(start.scale > mid.scale)
  assert.equal(turn.along, 1)
  assert.equal(turn.facing, 'start')
  assert.equal(home.along, 0)
  assert.ok(home.bottomPercent < turn.bottomPercent)
})

test('out-and-back laps cycle between trip 1 and trip 2', () => {
  assert.equal(walkwayLapFromLegIndex(0), 1)
  assert.equal(walkwayLapFromLegIndex(1), 2)
  assert.equal(walkwayLapFromLegIndex(2), 1)
})

test('walker sprite queues at most two extra steps and advances one frame at a time', () => {
  assert.equal(queuedWalkerSteps(0, 1, 0), 1)
  assert.equal(queuedWalkerSteps(3, 10, 0), 2)
  assert.equal(queuedWalkerSteps(8, 0, 1), 1)
  assert.equal(nextWalkerFrame(7), 0)
  assert.equal(nextWalkerFrame(3), 4)
})
