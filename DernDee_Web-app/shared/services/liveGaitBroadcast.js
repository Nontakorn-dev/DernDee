import { getSupabaseClient, isSupabaseConfigured } from '@shared/supabase/client.js'

const LIVE_GAIT_CHANNEL_PREFIX = 'live-gait-stream'
const LIVE_GAIT_SAMPLES_EVENT = 'samples'
const LIVE_GAIT_STATUS_EVENT = 'status'
const LIVE_GAIT_VIEWER_EVENT = 'viewer'
const LIVE_GAIT_PROTOCOL_VERSION = 1
const DEFAULT_BATCH_INTERVAL_MS = 200
const DEFAULT_MAX_BATCH_SIZE = 24
const DOCTOR_VIEWER_ROLE = 'doctor-viewer'
const PATIENT_PUBLISHER_ROLE = 'patient-publisher'
const VIEWER_HEARTBEAT_INTERVAL_MS = 2000
const VIEWER_HEARTBEAT_TIMEOUT_MS = 5000

function getLiveGaitChannelName(patientId) {
  const normalizedPatientId = String(patientId || '').trim()

  if (!normalizedPatientId) {
    throw new Error('Patient ID is required for live gait broadcast')
  }

  return `${LIVE_GAIT_CHANNEL_PREFIX}:${normalizedPatientId}`
}

function toFiniteNumber(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function normalizeLiveSample(sample) {
  const accel = Array.isArray(sample?.raw_accel) ? sample.raw_accel : null
  const gyro = Array.isArray(sample?.raw_gyro) ? sample.raw_gyro : null
  const normalized = {
    ax: toFiniteNumber(sample?.ax ?? accel?.[0]),
    ay: toFiniteNumber(sample?.ay ?? accel?.[1]),
    az: toFiniteNumber(sample?.az ?? accel?.[2]),
    gx: toFiniteNumber(sample?.gx ?? gyro?.[0]),
    gy: toFiniteNumber(sample?.gy ?? gyro?.[1]),
    gz: toFiniteNumber(sample?.gz ?? gyro?.[2]),
  }

  if (Object.values(normalized).some((value) => value == null)) {
    return null
  }

  return normalized
}

function flattenPresenceStateEntries(state) {
  return Object.values(state || {}).flatMap((entry) => {
    if (Array.isArray(entry)) {
      return entry
    }

    if (Array.isArray(entry?.metas)) {
      return entry.metas
    }

    return []
  })
}

function countDoctorViewers(channel) {
  if (!channel || typeof channel.presenceState !== 'function') {
    return 0
  }

  return flattenPresenceStateEntries(channel.presenceState())
    .filter((meta) => meta?.role === DOCTOR_VIEWER_ROLE)
    .length
}

function createChannel(channelName, options = {}) {
  const supabase = getSupabaseClient()
  const { presenceKey } = options

  return supabase.channel(channelName, {
    config: {
      broadcast: {
        self: false,
        ack: false,
      },
      presence: presenceKey
        ? {
            key: presenceKey,
          }
        : undefined,
    },
  })
}

async function removeChannel(channel) {
  if (!channel || !isSupabaseConfigured) {
    return
  }

  const supabase = getSupabaseClient()
  await supabase.removeChannel(channel)
}

export function createLiveGaitBroadcastPublisher(options = {}) {
  const {
    patientId,
    batchIntervalMs = DEFAULT_BATCH_INTERVAL_MS,
    maxBatchSize = DEFAULT_MAX_BATCH_SIZE,
  } = options

  const channelName = getLiveGaitChannelName(patientId)

  let channel = null
  let connected = false
  let flushTimer = null
  let pendingSamples = []
  let viewerCount = 0
  let lastStatus = 'disconnected'
  const viewerHeartbeats = new Map()

  function pruneViewerHeartbeats() {
    const now = Date.now()

    for (const [viewerId, expiresAt] of viewerHeartbeats.entries()) {
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        viewerHeartbeats.delete(viewerId)
      }
    }
  }

  function recalculateViewerCount() {
    const previousViewerCount = viewerCount
    pruneViewerHeartbeats()
    viewerCount = Math.max(countDoctorViewers(channel), viewerHeartbeats.size)

    if (viewerCount === 0) {
      pendingSamples = []
      return
    }

    if (previousViewerCount === 0 && lastStatus) {
      void publishStatus(lastStatus)
    }
  }

  function handlePresenceSync() {
    recalculateViewerCount()
  }

  function handleViewerSignal(payload) {
    const viewerId = String(payload?.viewerId || 'doctor-viewer')

    if (payload?.state === 'closed') {
      viewerHeartbeats.delete(viewerId)
      recalculateViewerCount()
      return
    }

    viewerHeartbeats.set(viewerId, Date.now() + VIEWER_HEARTBEAT_TIMEOUT_MS)
    recalculateViewerCount()
  }

  async function connect() {
    if (connected && channel) {
      return
    }

    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured for live gait broadcast')
    }

    if (channel) {
      await disconnect()
    }

    channel = createChannel(channelName, {
      presenceKey: `patient-publisher-${patientId}`,
    })
    channel
      .on('broadcast', { event: LIVE_GAIT_VIEWER_EVENT }, ({ payload }) => {
        handleViewerSignal(payload)
      })
      .on('presence', { event: 'sync' }, () => {
        handlePresenceSync()
      })
      .on('presence', { event: 'join' }, () => {
        handlePresenceSync()
      })
      .on('presence', { event: 'leave' }, () => {
        handlePresenceSync()
      })

    await new Promise((resolve, reject) => {
      let settled = false

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              role: PATIENT_PUBLISHER_ROLE,
              patientId,
              openedAt: Date.now(),
            })
            connected = true
            settled = true
            handlePresenceSync()
            flushTimer = window.setInterval(() => {
              void flushSamples()
            }, batchIntervalMs)
            resolve()
          } catch (error) {
            settled = true
            reject(error)
          }
          return
        }

        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          settled = true
          reject(new Error(`Live gait publisher failed to subscribe: ${status}`))
          return
        }

        if (status === 'CLOSED') {
          connected = false
        }
      })
    })
  }

  async function flushSamples() {
    recalculateViewerCount()

    if (!connected || !channel || viewerCount === 0 || pendingSamples.length === 0) {
      return
    }

    const samples = pendingSamples
    pendingSamples = []

    try {
      await channel.send({
        type: 'broadcast',
        event: LIVE_GAIT_SAMPLES_EVENT,
        payload: {
          version: LIVE_GAIT_PROTOCOL_VERSION,
          patientId,
          sentAtMs: Date.now(),
          samples,
        },
      })
    } catch (error) {
      pendingSamples = [...samples, ...pendingSamples]
      throw error
    }
  }

  function enqueueSample(sample) {
    recalculateViewerCount()

    if (viewerCount === 0) {
      return
    }

    const normalizedSample = normalizeLiveSample(sample)

    if (!normalizedSample) {
      return
    }

    pendingSamples.push(normalizedSample)

    if (pendingSamples.length >= maxBatchSize) {
      void flushSamples()
    }
  }

  async function publishStatus(status) {
    if (typeof status !== 'string') {
      return
    }

    lastStatus = status
    recalculateViewerCount()

    if (!connected || !channel || viewerCount === 0) {
      return
    }

    await channel.send({
      type: 'broadcast',
      event: LIVE_GAIT_STATUS_EVENT,
      payload: {
        version: LIVE_GAIT_PROTOCOL_VERSION,
        patientId,
        sentAtMs: Date.now(),
        status,
      },
    })
  }

  async function disconnect() {
    const channelToRemove = channel

    if (flushTimer) {
      window.clearInterval(flushTimer)
      flushTimer = null
    }

    channel = null
    connected = false
    viewerCount = 0
    viewerHeartbeats.clear()

    if (!channelToRemove) {
      pendingSamples = []
      return
    }

    try {
      await flushSamples()
    } catch {
      pendingSamples = []
    }

    pendingSamples = []
    await removeChannel(channelToRemove)
  }

  return {
    connect,
    disconnect,
    enqueueSample,
    publishStatus,
  }
}

export class LiveGaitBroadcastStreamClient {
  constructor(options = {}) {
    this.patientId = String(options.patientId || '').trim()
    this.viewerId = String(options.viewerId || '').trim()
    this.viewerKey = this.viewerId || `doctor-viewer-${Math.random().toString(36).slice(2)}`
    this.channel = null
    this.connected = false
    this.listeners = []
    this.statusListeners = []
    this.viewerHeartbeatTimer = null
  }

  onData(callback) {
    this.listeners.push(callback)
  }

  onStatus(callback) {
    this.statusListeners.push(callback)
  }

  async connect() {
    if (this.connected && this.channel) {
      return
    }

    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured for live gait broadcast')
    }

    if (!this.patientId) {
      throw new Error('Patient ID is required for live gait subscription')
    }

    this.disconnect()
    this._emitStatus('connecting')

    const channelName = getLiveGaitChannelName(this.patientId)
    this.channel = createChannel(channelName, {
      presenceKey: this.viewerKey,
    })

    this.channel
      .on('broadcast', { event: LIVE_GAIT_SAMPLES_EVENT }, ({ payload }) => {
        const samples = Array.isArray(payload?.samples) ? payload.samples : []

        if (samples.length > 0) {
          this._emitStatus('connected')
        }

        samples.forEach((sample) => {
          const normalizedSample = normalizeLiveSample(sample)
          if (!normalizedSample) {
            return
          }

          this.listeners.forEach((callback) => callback(normalizedSample))
        })
      })
      .on('broadcast', { event: LIVE_GAIT_STATUS_EVENT }, ({ payload }) => {
        if (typeof payload?.status === 'string') {
          this._emitStatus(payload.status)
        }
      })

    await new Promise((resolve, reject) => {
      let settled = false

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await this.channel.track({
              role: DOCTOR_VIEWER_ROLE,
              viewerId: this.viewerKey,
              patientId: this.patientId,
              openedAt: Date.now(),
            })
            await this._sendViewerSignal('open')
            this._startViewerHeartbeat()
            this.connected = true
            this._emitStatus('connected')
            settled = true
            resolve()
          } catch (error) {
            this.connected = false
            this._emitStatus('error')
            settled = true
            reject(error)
          }
          return
        }

        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          this.connected = false
          this._emitStatus('error')
          settled = true
          reject(new Error(`Live gait subscription failed: ${status}`))
          return
        }

        if (status === 'CLOSED') {
          this.connected = false
          this._emitStatus('disconnected')
        }
      })
    })
  }

  disconnect() {
    const channelToRemove = this.channel
    this._stopViewerHeartbeat()
    this.channel = null
    this.connected = false
    this._emitStatus('disconnected')

    if (channelToRemove) {
      void this._sendViewerSignal('closed', channelToRemove)
      void removeChannel(channelToRemove)
    }
  }

  _startViewerHeartbeat() {
    this._stopViewerHeartbeat()
    this.viewerHeartbeatTimer = window.setInterval(() => {
      void this._sendViewerSignal('heartbeat')
    }, VIEWER_HEARTBEAT_INTERVAL_MS)
  }

  _stopViewerHeartbeat() {
    if (this.viewerHeartbeatTimer) {
      window.clearInterval(this.viewerHeartbeatTimer)
      this.viewerHeartbeatTimer = null
    }
  }

  async _sendViewerSignal(state, targetChannel = this.channel) {
    if (!targetChannel) {
      return
    }

    try {
      await targetChannel.send({
        type: 'broadcast',
        event: LIVE_GAIT_VIEWER_EVENT,
        payload: {
          version: LIVE_GAIT_PROTOCOL_VERSION,
          patientId: this.patientId,
          viewerId: this.viewerKey,
          state,
          sentAtMs: Date.now(),
        },
      })
    } catch {
      // Ignore viewer heartbeat failures and let presence/subsequent heartbeats recover.
    }
  }

  _emitStatus(status) {
    this.statusListeners.forEach((callback) => callback(status))
  }
}

export function createLiveGaitBroadcastStreamClient(options) {
  return new LiveGaitBroadcastStreamClient(options)
}