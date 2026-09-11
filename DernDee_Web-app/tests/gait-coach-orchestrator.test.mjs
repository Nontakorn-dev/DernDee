import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GaitCoachOrchestrator } from '../shared/coach/gaitCoachOrchestrator.js'
import { COACH_SYSTEM_INSTRUCTION } from '../shared/coach/coachSystemInstruction.js'

test('walkway idle invite plays after 12 s with no new steps', () => {
  const orchestrator = new GaitCoachOrchestrator()
  orchestrator.lastStepAtMs = Date.now() - 13_000

  const dispatch = orchestrator.evaluateIdle({
    protocol: 'walkway',
    sessionElapsedS: 20,
    params: { stepCount: 3 },
  })

  assert.equal(dispatch?.trigger, 'idle_resume')
})

test('walkway idle invite waits until 12 s without a new step', () => {
  const orchestrator = new GaitCoachOrchestrator()
  orchestrator.lastStepAtMs = Date.now() - 5_000

  assert.equal(orchestrator.evaluateIdle({ protocol: 'walkway', sessionElapsedS: 20 }), null)
})

test('walkway idle invite stays quiet while paused or resting', () => {
  const orchestrator = new GaitCoachOrchestrator()
  orchestrator.lastStepAtMs = Date.now() - 13_000
  orchestrator.setPaused(true)
  assert.equal(orchestrator.evaluateIdle({ protocol: 'walkway' }), null)

  orchestrator.setPaused(false)
  orchestrator.restUntilMs = Date.now() + 4_000
  assert.equal(orchestrator.evaluateIdle({ protocol: 'walkway' }), null)
})

test('user questions ask for a short 1 to 2 sentence reply', () => {
  const orchestrator = new GaitCoachOrchestrator()
  const dispatch = orchestrator.buildUserQuestionDispatch({}, 'ติดเซนเซอร์ยังไง', 20)
  assert.match(dispatch.prompt, /ไม่เกิน 2 ประโยค/)
  assert.match(dispatch.prompt, /35 คำ/)
  assert.doesNotMatch(dispatch.prompt, /3 ถึง 6 ประโยค/)
  assert.doesNotMatch(COACH_SYSTEM_INSTRUCTION, /ยาวพอให้ถูก/)
  assert.doesNotMatch(COACH_SYSTEM_INSTRUCTION, /3 ถึง 6 ประโยค/)
  assert.match(COACH_SYSTEM_INSTRUCTION, /ถ้าจบได้ในประโยคเดียว/)
})

test('walkway evaluate still skips per-step metric coaching', () => {
  const orchestrator = new GaitCoachOrchestrator()
  const dispatch = orchestrator.evaluate(
    { stepCount: 4, stepLength: 0.12, cadence: 40, walkingSpeed: 0.2, clearance: 0 },
    { protocol: 'walkway', sessionElapsedS: 30 },
  )
  assert.equal(dispatch, null)
})
