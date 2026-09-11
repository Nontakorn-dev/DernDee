import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AVATAR_CLIPS,
  SPEECH_CLIP_IN_POINT_S,
  TALK_SMALL_LOOP_END_S,
  TALK_SMALL_LOOP_START_S,
  wrapTalkLoopTime,
} from '../apps/patient/src/components/walk/avatarClips.js'

test('talk clip loops inside the open-mouth window', () => {
  assert.equal(AVATAR_CLIPS.talkSmall.loopStart, TALK_SMALL_LOOP_START_S)
  assert.equal(AVATAR_CLIPS.talkSmall.loopEnd, TALK_SMALL_LOOP_END_S)
  assert.ok(TALK_SMALL_LOOP_START_S > 0.9)
  assert.ok(TALK_SMALL_LOOP_END_S - TALK_SMALL_LOOP_START_S > 3)
  assert.equal(wrapTalkLoopTime(1.2, TALK_SMALL_LOOP_START_S, TALK_SMALL_LOOP_END_S), 1.2)
  assert.equal(
    wrapTalkLoopTime(TALK_SMALL_LOOP_END_S, TALK_SMALL_LOOP_START_S, TALK_SMALL_LOOP_END_S),
    TALK_SMALL_LOOP_START_S,
  )
  assert.equal(wrapTalkLoopTime(5.9, TALK_SMALL_LOOP_START_S, TALK_SMALL_LOOP_END_S), TALK_SMALL_LOOP_START_S)
})

test('advice clips skip the closed-mouth intro', () => {
  assert.equal(AVATAR_CLIPS.nearEnd.inPoint, SPEECH_CLIP_IN_POINT_S)
  assert.equal(AVATAR_CLIPS.walkwayFaster0.inPoint, SPEECH_CLIP_IN_POINT_S)
  assert.equal(AVATAR_CLIPS.walkwayLonger0.inPoint, SPEECH_CLIP_IN_POINT_S)
  assert.equal(AVATAR_CLIPS.walkwayKeep0.inPoint, SPEECH_CLIP_IN_POINT_S)
  assert.equal(AVATAR_CLIPS.turnRest.inPoint, undefined)
  assert.equal(AVATAR_CLIPS.idle.loopStart, undefined)
})
