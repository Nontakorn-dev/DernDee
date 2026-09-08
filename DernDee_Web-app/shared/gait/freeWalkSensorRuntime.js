import { createCalibratedGaitProcessorClient } from './gaitProcessorClient.js'
import { GAIT_MIN_ANALYSIS_SAMPLES } from './gaitRuntimeConfig.js'
import { GaitSessionAnalyzer } from './sessionAnalyzer.js'

export class FreeWalkSensorRuntime {
  constructor(sample, { onParams, createProcessor = createCalibratedGaitProcessorClient } = {}) {
    this.sensorKey = sample.sensorKey
    this.side = sample.side || null
    this.sensorMount = sample.sensorMount || 'unknown'
    this.lastSeenAt = Date.now()
    this.sessionAnalyzer = new GaitSessionAnalyzer()
    this.latestParams = null
    this.sampleCount = 0
    this.active = false
    this.generation = 0
    this.processor = null
    this.calibration = null
    this.createProcessor = createProcessor
    this.onParams = onParams
  }

  setActive(active) {
    if (this.active === active) return
    this.active = active
    const generation = ++this.generation
    this.processor?.destroy()
    this.processor = null
    this.sampleCount = 0
    if (!active) return

    // A new segment cannot form a gait cycle across a pause. Completed rows
    // and session totals survive; queued replies from the old worker do not.
    const stepOffset = this.sessionAnalyzer.getSummary().totalSteps
    const processor = this.createProcessor(this.sensorKey)
    this.processor = processor
    if (this.calibration) processor.applyCalibration(this.calibration)
    processor.onParams(({ params }) => {
      if (!this.active || generation !== this.generation || !params) return
      const stepCount = stepOffset + (params.stepCount || 0)
      const sessionParams = {
        ...params,
        cycleKey: `${generation}:${params.cycleKey}`,
        stepCount,
        strideCount: Math.floor(stepCount / 2),
      }
      this.latestParams = sessionParams
      this.sessionAnalyzer.record(sessionParams)
      this.onParams?.(sessionParams)
    })
  }

  applyCalibration(profile) {
    this.calibration = profile
    this.processor?.applyCalibration(profile)
  }

  addSample(sample) {
    if (!this.active) return
    this.processor.addSample(sample)
    this.sampleCount += 1
  }

  analyze() {
    if (this.active && this.sampleCount >= GAIT_MIN_ANALYSIS_SAMPLES) {
      this.processor.analyze()
    }
  }

  destroy() {
    this.setActive(false)
  }
}
