import { GaitProcessor } from './gaitProcessor.js'

const processor = new GaitProcessor()

processor.onParams((payload) => {
  self.postMessage({
    type: 'analysis',
    payload,
  })
})

self.onmessage = (event) => {
  const { type, payload } = event.data || {}

  if (type === 'add-sample') {
    processor.addSample(payload)
    return
  }

  if (type === 'analyze') {
    processor.analyze()
    return
  }

  if (type === 'reset') {
    processor.reset()
    return
  }

  if (type === 'destroy') {
    self.close()
  }
}