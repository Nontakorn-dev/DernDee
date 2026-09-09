import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FreeWalkWalkwayTracker, selectWalkwayAdvice } from '../shared/gait/freeWalkWalkway.js'
import { walkwayStoneWindow } from '../shared/gait/walkwayStoneWindow.js'
import { walkwayLapFromLegIndex, walkwayTrackPosition } from '../shared/gait/walkwayTrackPosition.js'
import { nextWalkerFrame, queuedWalkerSteps } from '../apps/patient/src/components/walk/walkSprites.js'

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

test('later legs use 5 m / steps from the completed leg', () => {
  const walkway = new FreeWalkWalkwayTracker()
  let turn = null
  const started = 5_000
  for (let step = 1; step <= 10; step += 1) {
    const result = walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, started + (step * 600))
    const hit = result.events.find((event) => event.type === 'turn_rest')
    if (hit) turn = hit
  }

  assert.ok(turn)
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

test('yaw turn near the end completes a leg', () => {
  const walkway = new FreeWalkWalkwayTracker()
  for (let step = 1; step <= 6; step += 1) {
    walkway.ingestStep({ stepCount: step, stepLength: 0.9 }, 2_000 + step)
  }

  walkway.ingestYaw(0, 3_000)
  const turn = walkway.ingestYaw(170, 4_000)
  assert.equal(turn?.type, 'turn_rest')
  assert.equal(turn.reason, 'yaw_turn')
  assert.equal(turn.stepLengthM, 5 / 6)
  assert.equal(walkway.progressM, 0)

  const next = walkway.ingestStep({ stepCount: 7, stepLength: 0.9 }, 5_000)
  assert.ok(Math.abs(next.progressM - (5 / 6)) < 0.001)
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
