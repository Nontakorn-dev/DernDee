const TRANSPORT_MODE_STORAGE_KEY = 'derndee:realtime-transport-mode'
const DEVICE_ASSIGNMENTS_STORAGE_KEY = 'derndee:browser-ble-assignments'
const TRANSPORT_MODE_WEB_BLUETOOTH = 'web-bluetooth'
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'
const BLE_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'
const BLE_DEVICE_PREFIX = 'DernDee'
const CALIBRATION_DELAY_MS = 3000

const BODY_POSITIONS = [
  { id: 'PELVIS', name: 'Chest', order: 1, deviceId: 'DernDee_Sensor_001' },
  { id: 'LEFT_THIGH', name: 'Left Thigh', order: 2, deviceId: 'DernDee_Sensor_002' },
  { id: 'RIGHT_THIGH', name: 'Right Thigh', order: 3, deviceId: 'DernDee_Sensor_003' },
  { id: 'LEFT_SHANK', name: 'Left Ankle', order: 4, deviceId: 'DernDee_Sensor_004' },
  { id: 'RIGHT_SHANK', name: 'Right Ankle', order: 5, deviceId: 'DernDee_Sensor_005' },
]

function getStoredMode() {
  if (typeof window === 'undefined') {
    return TRANSPORT_MODE_WEB_BLUETOOTH
  }

  const storedMode = window.sessionStorage.getItem(TRANSPORT_MODE_STORAGE_KEY)
  return storedMode === TRANSPORT_MODE_WEB_BLUETOOTH ? storedMode : TRANSPORT_MODE_WEB_BLUETOOTH
}

function setStoredMode(mode) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(TRANSPORT_MODE_STORAGE_KEY, mode)
}

function getStoredAssignments() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.sessionStorage.getItem(DEVICE_ASSIGNMENTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function setStoredAssignments(assignments) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(DEVICE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments || {}))
}

function calculateCrc8(bytes) {
  let crc = 0x00
  for (const byte of bytes) {
    crc ^= byte
    for (let index = 0; index < 8; index += 1) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xff
      } else {
        crc = (crc << 1) & 0xff
      }
    }
  }
  return crc
}

function decodePacket(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes.byteLength !== 22) {
    return null
  }

  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const magic = dataView.getUint16(0, true)
  if (magic !== 0xaa55) {
    return null
  }

  const crc8 = dataView.getUint8(21)
  if (calculateCrc8(bytes.slice(0, 21)) !== crc8) {
    return null
  }

  return {
    raw_accel: [
      dataView.getInt16(9, true),
      dataView.getInt16(11, true),
      dataView.getInt16(13, true),
    ],
    raw_gyro: [
      dataView.getInt16(15, true),
      dataView.getInt16(17, true),
      dataView.getInt16(19, true),
    ],
    timestamp_ms: dataView.getUint32(5, true) / 1000,
    seq: dataView.getUint16(3, true),
  }
}

function inferSensorMount(senderName = '') {
  return senderName.includes('Shank') ? 'shank' : 'foot'
}

function inferSide(senderName = '') {
  if (senderName.includes('_L_') || senderName.includes('Left') || senderName.includes('L_Shank')) {
    return 'L'
  }
  return 'R'
}

function createInitialDevices() {
  return BODY_POSITIONS.map((position) => ({
    positionId: position.id,
    positionName: position.name,
    order: position.order,
    expectedDeviceId: position.deviceId,
    deviceId: null,
    deviceName: null,
    status: 'disconnected',
    battery: null,
    signal: null,
    packetCount: 0,
    lastPacketSize: null,
  }))
}

class BrowserBleSocket {
  constructor(manager) {
    this.manager = manager
    this.readyState = WebSocket.CONNECTING
    this.onopen = null
    this.onclose = null
    this.onerror = null
    this.onmessage = null
    this.closed = false
  }

  emitOpen() {
    if (this.closed) {
      return
    }
    this.readyState = WebSocket.OPEN
    this.onopen?.()
  }

  emitClose() {
    if (this.closed) {
      return
    }
    this.closed = true
    this.readyState = WebSocket.CLOSED
    this.onclose?.()
  }

  emitError(error) {
    if (this.closed) {
      return
    }
    this.onerror?.(error)
  }

  emitMessage(message) {
    if (this.closed || this.readyState !== WebSocket.OPEN) {
      return
    }
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  send(rawMessage) {
    if (this.closed || this.readyState !== WebSocket.OPEN) {
      return
    }
    this.manager.handleClientSend(rawMessage)
  }

  close() {
    if (this.closed) {
      return
    }
    this.manager.unregisterSocket(this)
    this.emitClose()
  }
}

class BrowserBleManager {
  constructor() {
    this.sockets = new Set()
    this.deviceStateListeners = new Set()
    this.modeListeners = new Set()
    this.connections = new Map()
    this.devices = createInitialDevices()
    this.deviceAssignments = getStoredAssignments()
    this.mode = getStoredMode()
    this.activeSession = null
    this.calibrationTimer = null
  }

  isWebBluetoothSupported() {
    return typeof navigator !== 'undefined' && typeof navigator.bluetooth?.requestDevice === 'function'
  }

  supportsRememberedDevices() {
    return typeof navigator !== 'undefined' && typeof navigator.bluetooth?.getDevices === 'function'
  }

  getMode() {
    return this.mode
  }

  setMode(nextMode) {
    void nextMode
    if (this.mode === TRANSPORT_MODE_WEB_BLUETOOTH) {
      return
    }

    this.mode = TRANSPORT_MODE_WEB_BLUETOOTH
    setStoredMode(TRANSPORT_MODE_WEB_BLUETOOTH)
    this.notifyModeListeners()
  }

  subscribeToMode(listener) {
    this.modeListeners.add(listener)
    listener(this.mode)
    return () => {
      this.modeListeners.delete(listener)
    }
  }

  notifyModeListeners() {
    for (const listener of this.modeListeners) {
      listener(this.mode)
    }
  }

  getDevicesSnapshot() {
    return this.devices.map((device) => ({ ...device }))
  }

  subscribeToDeviceState(listener) {
    this.deviceStateListeners.add(listener)
    listener(this.getDevicesSnapshot())
    return () => {
      this.deviceStateListeners.delete(listener)
    }
  }

  notifyDeviceState() {
    const snapshot = this.getDevicesSnapshot()
    for (const listener of this.deviceStateListeners) {
      listener(snapshot)
    }
  }

  persistAssignments() {
    setStoredAssignments(this.deviceAssignments)
  }

  rememberDevice(positionId, bluetoothDevice, fallbackDeviceId) {
    this.deviceAssignments[positionId] = {
      bluetoothId: bluetoothDevice?.id || null,
      name: bluetoothDevice?.name || null,
      fallbackDeviceId: fallbackDeviceId || null,
      savedAt: Date.now(),
    }
    this.persistAssignments()
  }

  forgetDevice(positionId) {
    if (!this.deviceAssignments[positionId]) {
      return
    }

    delete this.deviceAssignments[positionId]
    this.persistAssignments()
  }

  async resolveDeviceForPosition(positionId, { preferKnownDevice = false, pickerFallback = true } = {}) {
    const target = this.devices.find((device) => device.positionId === positionId)
    if (!target) {
      throw new Error('Unknown device slot.')
    }

    const assignment = this.deviceAssignments[positionId]
    if (preferKnownDevice && assignment && this.supportsRememberedDevices()) {
      const grantedDevices = await navigator.bluetooth.getDevices()
      const matchedDevice = grantedDevices.find((device) => {
        const matchesId = assignment.bluetoothId && device.id === assignment.bluetoothId
        const matchesName = assignment.name && device.name === assignment.name
        return matchesId || matchesName
      })

      if (matchedDevice) {
        return {
          bluetoothDevice: matchedDevice,
          selectedDeviceKey: matchedDevice.id || matchedDevice.name || assignment.fallbackDeviceId || target.expectedDeviceId,
          target,
        }
      }
    }

    if (!pickerFallback) {
      throw new Error('No reusable browser BLE permission was found for this sensor on the new page.')
    }

    const bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: BLE_DEVICE_PREFIX, services: [BLE_SERVICE_UUID] }],
      optionalServices: [BLE_SERVICE_UUID],
    })

    return {
      bluetoothDevice,
      selectedDeviceKey: bluetoothDevice.id || bluetoothDevice.name || target.expectedDeviceId,
      target,
    }
  }

  createSocket() {
    const socket = new BrowserBleSocket(this)
    this.sockets.add(socket)
    queueMicrotask(() => {
      socket.emitOpen()
    })
    return socket
  }

  unregisterSocket(socket) {
    this.sockets.delete(socket)
  }

  forceCloseSockets() {
    for (const socket of Array.from(this.sockets)) {
      this.sockets.delete(socket)
      socket.emitClose()
    }
  }

  updateDevice(positionId, updater) {
    this.devices = this.devices.map((device) => (
      device.positionId === positionId ? updater(device) : device
    ))
    this.notifyDeviceState()
  }

  resetDeviceState() {
    this.devices = createInitialDevices()
    this.notifyDeviceState()
  }

  hasConnectedDevices() {
    return this.devices.some((device) => device.status === 'connected')
  }

  async connectDevice(positionId, options = {}) {
    if (!this.isWebBluetoothSupported()) {
      throw new Error('Web Bluetooth is not available in this browser.')
    }

    const target = this.devices.find((device) => device.positionId === positionId)
    if (!target) {
      throw new Error('Unknown device slot.')
    }

    await this.disconnectDevice(positionId, { silent: true })
    this.updateDevice(positionId, (device) => ({
      ...device,
      status: 'connecting',
      deviceId: null,
      deviceName: null,
      battery: null,
      signal: null,
      packetCount: 0,
      lastPacketSize: null,
    }))

    try {
      const {
        bluetoothDevice,
        selectedDeviceKey,
      } = await this.resolveDeviceForPosition(positionId, options)

      if (!bluetoothDevice.gatt) {
        throw new Error('This browser does not expose a usable GATT transport for the selected sensor.')
      }

      const alreadyAssigned = this.devices.some((device) => (
        device.positionId !== positionId
        && device.deviceId
        && device.deviceId === selectedDeviceKey
      ))
      if (alreadyAssigned) {
        throw new Error('This sensor is already assigned to another body position.')
      }

      const server = await bluetoothDevice.gatt.connect()
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)
      const characteristic = await service.getCharacteristic(BLE_CHARACTERISTIC_UUID)

      const disconnectHandler = () => {
        this.connections.delete(positionId)
        this.updateDevice(positionId, (device) => ({
          ...device,
          status: 'error',
          signal: null,
        }))
      }

      const notificationHandler = (event) => {
        const packetBytes = new Uint8Array(event.target.value.buffer.slice(0))
        const decoded = decodePacket(packetBytes)
        if (!decoded) {
          return
        }

        this.updateDevice(positionId, (device) => ({
          ...device,
          status: 'connected',
          signal: 'Streaming',
          packetCount: device.packetCount + 1,
          lastPacketSize: packetBytes.byteLength,
        }))

        this.broadcast({
          type: 'DATA',
          payload: {
            name: bluetoothDevice.name || target.expectedDeviceId,
            side: inferSide(bluetoothDevice.name || target.expectedDeviceId),
            sensor_mount: inferSensorMount(bluetoothDevice.name || target.expectedDeviceId),
            timestamp_ms: decoded.timestamp_ms,
            raw_accel: decoded.raw_accel,
            raw_gyro: decoded.raw_gyro,
            seq: decoded.seq,
          },
        })
      }

      bluetoothDevice.addEventListener('gattserverdisconnected', disconnectHandler)
      characteristic.addEventListener('characteristicvaluechanged', notificationHandler)
      await characteristic.startNotifications()

      this.connections.set(positionId, {
        device: bluetoothDevice,
        characteristic,
        notificationHandler,
        disconnectHandler,
      })

      this.updateDevice(positionId, (device) => ({
        ...device,
        status: 'connected',
        deviceId: selectedDeviceKey,
        deviceName: bluetoothDevice.name || 'DernDee sensor',
        signal: 'Streaming',
      }))
      this.rememberDevice(positionId, bluetoothDevice, target.expectedDeviceId)
    } catch (error) {
      this.updateDevice(positionId, (device) => ({
        ...device,
        status: 'error',
        signal: null,
      }))
      throw error
    }
  }

  async disconnectDevice(positionId, { silent = false, forgetDevice = false } = {}) {
    const connection = this.connections.get(positionId)

    if (connection) {
      try {
        connection.characteristic?.removeEventListener('characteristicvaluechanged', connection.notificationHandler)
      } catch {
        // Ignore teardown errors.
      }

      try {
        connection.device?.removeEventListener('gattserverdisconnected', connection.disconnectHandler)
      } catch {
        // Ignore teardown errors.
      }

      try {
        await connection.characteristic?.stopNotifications()
      } catch {
        // Ignore teardown errors.
      }

      try {
        connection.device?.gatt?.disconnect()
      } catch {
        // Ignore teardown errors.
      }

      this.connections.delete(positionId)
    }

    this.updateDevice(positionId, (device) => ({
      ...device,
      status: 'disconnected',
      deviceId: null,
      deviceName: null,
      battery: null,
      signal: null,
      packetCount: 0,
      lastPacketSize: null,
    }))

    if (!silent && !this.hasConnectedDevices()) {
      this.broadcast({ type: 'SYSTEM_RESET' })
    }

    if (forgetDevice) {
      this.forgetDevice(positionId)
    }
  }

  async disconnectAllDevices({ keepMode = false, forgetDevices = false } = {}) {
    const positionIds = Array.from(this.connections.keys())
    await Promise.all(positionIds.map((positionId) => this.disconnectDevice(positionId, {
      silent: true,
      forgetDevice: forgetDevices,
    })))
    this.resetDeviceState()
    this.clearCalibrationTimer()
    this.activeSession = null
    if (forgetDevices) {
      this.deviceAssignments = {}
      this.persistAssignments()
    }
    if (!keepMode) {
      this.mode = TRANSPORT_MODE_WEB_BLUETOOTH
      setStoredMode(TRANSPORT_MODE_WEB_BLUETOOTH)
      this.notifyModeListeners()
    }
  }

  clearCalibrationTimer() {
    if (this.calibrationTimer) {
      window.clearTimeout(this.calibrationTimer)
      this.calibrationTimer = null
    }
  }

  handleClientSend(rawMessage) {
    let messageType = rawMessage
    let payload = {}

    if (typeof rawMessage === 'string' && rawMessage.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawMessage)
        messageType = parsed.type
        payload = parsed.payload || {}
      } catch {
        messageType = rawMessage
      }
    }

    if (messageType === 'CALIBRATE') {
      if (!this.hasConnectedDevices()) {
        this.broadcast({ type: 'CALIBRATION_FAILED' })
        return
      }

      this.clearCalibrationTimer()
      this.broadcast({ type: 'CALIBRATION_START' })
      this.calibrationTimer = window.setTimeout(() => {
        this.calibrationTimer = null
        this.broadcast({ type: 'CALIBRATION_DONE' })
      }, CALIBRATION_DELAY_MS)
      return
    }

    if (messageType === 'RESET') {
      this.clearCalibrationTimer()
      this.activeSession = null
      this.broadcast({ type: 'SYSTEM_RESET' })
      return
    }

    if (messageType === 'START_SESSION') {
      this.activeSession = {
        patient_id: payload.patient_id,
        session_type: payload.session_type || 'free_walk',
        metadata: payload,
        started_at: Date.now(),
      }
      this.broadcast({
        type: 'SESSION_STARTED',
        payload: {
          patient_id: this.activeSession.patient_id,
          session_type: this.activeSession.session_type,
          transport: TRANSPORT_MODE_WEB_BLUETOOTH,
        },
      })
      return
    }

    if (messageType === 'END_SESSION') {
      this.broadcast({
        type: 'SESSION_SAVED',
        payload: {
          transport: TRANSPORT_MODE_WEB_BLUETOOTH,
          local_only: true,
          source: payload.source || 'frontend',
        },
      })
      this.activeSession = null
    }
  }

  broadcast(message) {
    for (const socket of this.sockets) {
      socket.emitMessage(message)
    }
  }
}

const browserBleManager = new BrowserBleManager()

export {
  BODY_POSITIONS,
  TRANSPORT_MODE_WEB_BLUETOOTH,
}

export function createRealtimeConnection() {
  return browserBleManager.createSocket()
}

export function getRealtimeTransportMode() {
  return browserBleManager.getMode()
}

export function setRealtimeTransportMode(mode) {
  browserBleManager.setMode(mode)
}

export function subscribeToRealtimeTransportMode(listener) {
  return browserBleManager.subscribeToMode(listener)
}

export function isWebBluetoothSupported() {
  return browserBleManager.isWebBluetoothSupported()
}

export function supportsRememberedBrowserBleDevices() {
  return browserBleManager.supportsRememberedDevices()
}

export function getBrowserBleDevicesSnapshot() {
  return browserBleManager.getDevicesSnapshot()
}

export function subscribeToBrowserBleDevices(listener) {
  return browserBleManager.subscribeToDeviceState(listener)
}

export async function connectBrowserBleDevice(positionId, options) {
  return browserBleManager.connectDevice(positionId, options)
}

export async function disconnectBrowserBleDevice(positionId, options) {
  return browserBleManager.disconnectDevice(positionId, options)
}

export async function resetBrowserBleDevices() {
  return browserBleManager.disconnectAllDevices({ keepMode: true })
}
