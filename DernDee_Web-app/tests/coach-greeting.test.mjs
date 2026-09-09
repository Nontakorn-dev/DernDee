import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCoachGreetingSpeech } from '../shared/coach/gaitCoachContext.js'
import { getWalkwayAdviceCue } from '../shared/coach/coachPhrases.js'

test('short intro lines count as greeting', () => {
  assert.equal(isCoachGreetingSpeech('สวัสดีครับ ผมสเต็ปดี ผู้ช่วยของคุณ'), true)
  assert.equal(isCoachGreetingSpeech('ยินดีที่ได้รู้จักนะครับ'), true)
})

test('later answers that mention StepDee are not treated as greeting', () => {
  assert.equal(isCoachGreetingSpeech('สเต็ปดีแนะนำให้ก้าวให้ยาวขึ้นอีกหน่อยนะครับ'), false)
  assert.equal(
    isCoachGreetingSpeech('เดินบนลู่ตรงยาวห้าเมตรที่เตรียมไว้ ไปจนสุดทางแล้วกลับหลังหันครับ'),
    false,
  )
})

test('return-walk advice starts with the return prompt', () => {
  assert.ok(getWalkwayAdviceCue('faster').example.startsWith('เดี๋ยวตอนเดินกลับลอง'))
  assert.ok(getWalkwayAdviceCue('longer_step').example.startsWith('เดี๋ยวตอนเดินกลับลอง'))
  assert.ok(getWalkwayAdviceCue('keep').example.startsWith('เดี๋ยวตอนเดินกลับลอง'))
})
