import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fadePcmChunkEdges } from '../shared/coach/audioPlayback.js'

test('pcm chunk edges fade in and out to avoid speaker chirps', () => {
  const samples = new Float32Array(10).fill(1)
  fadePcmChunkEdges(samples, 1000, 0.004, 0.004)
  assert.equal(samples[0], 0)
  assert.ok(samples[1] > 0 && samples[1] < 1)
  assert.equal(samples[4], 1)
  assert.ok(samples[8] > 0 && samples[8] < 1)
  assert.equal(samples[9], 0)
})
