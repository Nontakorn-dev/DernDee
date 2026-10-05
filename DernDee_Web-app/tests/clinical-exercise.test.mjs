import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CLINICAL_EXERCISES,
  createClinicalSession,
  poseSequence,
  tickClinical,
} from '../apps/patient/src/trail-quest/lib/clinicalExercise.js'

test('formal mode lists the four current exercises without game names', () => {
  assert.deepEqual(CLINICAL_EXERCISES.map((item) => item.id), [
    'dorsiflexor',
    'plantarflexor',
    'hip-flexor',
    'combined',
  ])
  assert.equal(CLINICAL_EXERCISES.some((item) => /นก|เหว|ธง|ไดโน/.test(item.title + item.summary)), false)
})

test('combined ankle practice alternates ankle poses and skips the knee pose', () => {
  assert.deepEqual(poseSequence('combined', 4, 'ankle'), ['duck', 'boost', 'duck', 'boost'])
  assert.deepEqual(poseSequence('plantarflexor', 3, 'full'), ['boost', 'boost', 'boost'])
  assert.deepEqual(poseSequence('hip-flexor', 2, 'full'), ['jump', 'jump'])
})

test('a released hold rests at 0 and a finished hold starts the walk interval', () => {
  const session = createClinicalSession({
    targetAngle: 12,
    walkSeconds: 5,
    poses: poseSequence('dorsiflexor', 2, 'full'),
  })
  const charged = tickClinical(session, 0.2, { mode: 'hold', holding: true, liveAngle: null })
  assert.ok(charged.angle > 0)
  const released = tickClinical(charged, 0.1, { mode: 'hold', holding: false, liveAngle: null })
  assert.equal(released.angle, 0)
  assert.equal(released.phase, 'hold')

  const reached = tickClinical(
    { ...session, angle: 11 },
    1,
    { mode: 'hold', holding: true, liveAngle: null },
  )
  assert.equal(reached.phase, 'walk')
  assert.equal(reached.angle, 0)
  assert.equal(reached.walkLeft, 5)
})

test('the last hold ends the exercise instead of asking for another walk', () => {
  const session = createClinicalSession({
    targetAngle: 12,
    walkSeconds: 5,
    poses: ['duck'],
  })
  const done = tickClinical(
    { ...session, angle: 12 },
    0.1,
    { mode: 'live', holding: false, liveAngle: 12 },
  )
  assert.equal(done.phase, 'done')
  assert.equal(done.angle, 12)
})
