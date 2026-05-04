import { GaitProcessor } from './gaitProcessor.js'

class LocalGaitProcessorClient {
  constructor() {
    this.processor = new GaitProcessor()
  }

  onParams(callback) {
    this.processor.onParams(callback)
    return () => {
      this.processor.paramListeners = this.processor.paramListeners.filter((listener) => listener !== callback)
    }
  }

  addSample(sample) {
    this.processor.addSample(sample)
  }

  analyze() {
    this.processor.analyze()
  }

  reset() {
    this.processor.reset()
  }

  destroy() {
    this.processor.reset()
    this.processor.paramListeners = []
  }
}

class WorkerGaitProcessorClient {
  constructor() {
    this.listeners = new Set()
    this.worker = new Worker(new URL('./gaitProcessor.worker.js', import.meta.url), {
      type: 'module',
    })

    this.worker.onmessage = (event) => {
      const { type, payload } = event.data || {}
      if (type !== 'analysis') {
        return
      }

      this.listeners.forEach((listener) => {
        listener(payload)
      })
    }

    this.worker.onerror = (error) => {
      console.error('Gait processor worker failed:', error)
    }
  }

  onParams(callback) {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  addSample(sample) {
    this.worker.postMessage({
      type: 'add-sample',
      payload: sample,
    })
  }

  analyze() {
    this.worker.postMessage({ type: 'analyze' })
  }

  reset() {
    this.worker.postMessage({ type: 'reset' })
  }

  destroy() {
    this.listeners.clear()
    this.worker.postMessage({ type: 'destroy' })
    this.worker.terminate()
  }
}

export function createGaitProcessorClient() {
  if (typeof Worker === 'undefined') {
    return new LocalGaitProcessorClient()
  }

  try {
    return new WorkerGaitProcessorClient()
  } catch (error) {
    console.warn('Falling back to main-thread gait processing:', error)
    return new LocalGaitProcessorClient()
  }
}