import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FreeWalkSensorRuntime } from '../shared/gait/freeWalkSensorRuntime.js'
import { GaitProcessor } from '../shared/gait/gaitProcessor.js'
import { generateWalkingData } from '../shared/gait-dashboard/data/demoDataGenerator.js'

function harness() {
  const processors = []
  const updates = []
  const runtime = new FreeWalkSensorRuntime({ sensorKey: 'LEFT_SHANK', side: 'L' }, {
    onParams: (params) => updates.push(params),
    createProcessor: () => {
      const processor = {
        samples: [], analyses: 0, destroyed: false, calibration: null,
        onParams(callback) { this.deliver = callback },
        addSample(sample) { this.samples.push(sample) },
        analyze() { this.analyses += 1 },
        applyCalibration(profile) { this.calibration = profile },
        destroy() { this.destroyed = true },
      }
      processors.push(processor)
      return processor
    },
  })
  return { runtime, processors, updates }
}

test('pre-start and paused samples do not enter analysis, while completed results survive', () => {
  const { runtime, processors, updates } = harness()
  for (let i = 0; i < 400; i++) runtime.addSample({ timestampMs: i * 10 })
  runtime.analyze()
  assert.equal(processors.length, 0)
  runtime.setActive(true)
  for (let i = 0; i < 300; i++) runtime.addSample({ timestampMs: i * 10 })
  runtime.analyze()
  assert.equal(processors[0].analyses, 1)
  processors[0].deliver({ params: { cycleKey: '1', stepCount: 1, stepLength: 0.3 } })
  runtime.setActive(false)
  for (let i = 0; i < 500; i++) runtime.addSample({ timestampMs: i * 10 })
  runtime.analyze()
  processors[0].deliver({ params: { cycleKey: '2', stepCount: 2 } })
  assert.equal(processors[0].samples.length, 300)
  assert.equal(processors[0].analyses, 1)
  assert.equal(updates.length, 1)
  assert.equal(runtime.sessionAnalyzer.getSummary().totalSteps, 1)
})

test('resume starts a fresh buffer and ignores a late worker reply even after resuming', () => {
  const { runtime, processors } = harness()
  const calibration = { ok: true, gyroBiasDps: { gx: 2, gy: 0, gz: 0 } }
  runtime.applyCalibration(calibration)
  runtime.setActive(true)
  processors[0].deliver({ params: { cycleKey: '1', stepCount: 2, stepLength: 0.3 } })
  runtime.setActive(false)
  runtime.setActive(true)
  assert.equal(processors[0].destroyed, true)
  assert.equal(processors[1].samples.length, 0)
  assert.equal(processors[1].calibration, calibration)
  processors[0].deliver({ params: { cycleKey: '2', stepCount: 99 } })
  processors[1].deliver({ params: { cycleKey: '1', stepCount: 1, stepLength: 0.4 } })
  assert.equal(runtime.sessionAnalyzer.getSummary().totalSteps, 3)
  assert.equal(runtime.sessionAnalyzer.getGaitMetricsRows().length, 2)
  assert.equal(runtime.latestParams.stepCount, 3)
  runtime.destroy()
  processors[1].deliver({ params: { cycleKey: '3', stepCount: 20 } })
  assert.equal(runtime.sessionAnalyzer.getSummary().totalSteps, 3)
})

test('real gait processing preserves pre-pause totals and counts new post-resume cycles', () => {
  const runtime = new FreeWalkSensorRuntime({ sensorKey: 'LEFT_SHANK' }, {
    createProcessor: () => {
      const processor = new GaitProcessor()
      processor.destroy = () => { processor.paramListeners = []; processor.reset() }
      return processor
    },
  })
  const originalRandom = Math.random
  Math.random = () => 0.5
  let samples
  try { samples = generateWalkingData({ numStrides: 8, strideTime: 1.4 }).samples }
  finally { Math.random = originalRandom }
  const feed = () => samples.forEach((sample, index) => {
    runtime.addSample(sample)
    if (index % 40 === 39) runtime.analyze()
  })
  runtime.setActive(true)
  feed()
  const before = runtime.sessionAnalyzer.getSummary().totalSteps
  assert.ok(before > 0)
  runtime.setActive(false)
  feed()
  assert.equal(runtime.sessionAnalyzer.getSummary().totalSteps, before)
  runtime.setActive(true)
  feed()
  assert.equal(runtime.sessionAnalyzer.getSummary().totalSteps, before * 2)
  runtime.destroy()
})
