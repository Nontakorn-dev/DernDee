const DB_NAME = 'derndee-offline-data'
const DB_VERSION = 1
const STORE_NAME = 'pending-sessions'
const OUTBOX_CHANGE_EVENT_NAME = 'derndee:session-outbox-change'

let databasePromise = null

function emitOutboxChange() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(OUTBOX_CHANGE_EVENT_NAME))
}

function supportsIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function openDatabase() {
  if (!supportsIndexedDb()) {
    return Promise.resolve(null)
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB outbox'))
      }
    }).catch((error) => {
      databasePromise = null
      throw error
    })
  }

  return databasePromise
}

function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted'))
  })
}

function waitForRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'))
  })
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record))
}

export async function enqueuePendingSession(record) {
  const database = await openDatabase()
  if (!database) {
    return false
  }

  const transaction = database.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).put(cloneRecord(record))
  await waitForTransaction(transaction)
  emitOutboxChange()
  return true
}

export async function removePendingSession(outboxId) {
  const database = await openDatabase()
  if (!database) {
    return false
  }

  const transaction = database.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).delete(outboxId)
  await waitForTransaction(transaction)
  emitOutboxChange()
  return true
}

export async function listPendingSessions() {
  const database = await openDatabase()
  if (!database) {
    return []
  }

  const transaction = database.transaction(STORE_NAME, 'readonly')
  const request = transaction.objectStore(STORE_NAME).getAll()
  const records = await waitForRequest(request)
  await waitForTransaction(transaction)

  return (records || [])
    .map((record) => cloneRecord(record))
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || left.updatedAt || '') || 0
      const rightTime = Date.parse(right.createdAt || right.updatedAt || '') || 0
      return leftTime - rightTime
    })
}

export async function countPendingSessions() {
  const database = await openDatabase()
  if (!database) {
    return 0
  }

  const transaction = database.transaction(STORE_NAME, 'readonly')
  const request = transaction.objectStore(STORE_NAME).count()
  const total = await waitForRequest(request)
  await waitForTransaction(transaction)
  return Number(total || 0)
}

export async function updatePendingSessionSyncState(outboxId, updates = {}) {
  const database = await openDatabase()
  if (!database) {
    return null
  }

  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const store = transaction.objectStore(STORE_NAME)
  const existingRecord = await waitForRequest(store.get(outboxId))

  if (!existingRecord) {
    await waitForTransaction(transaction)
    return null
  }

  const nextRecord = {
    ...existingRecord,
    ...cloneRecord(updates),
  }

  store.put(nextRecord)
  await waitForTransaction(transaction)
  emitOutboxChange()
  return cloneRecord(nextRecord)
}

export function isPendingSessionOutboxSupported() {
  return supportsIndexedDb()
}

export function subscribeToPendingSessionOutbox(listener) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleChange = () => {
    listener()
  }

  window.addEventListener(OUTBOX_CHANGE_EVENT_NAME, handleChange)
  return () => {
    window.removeEventListener(OUTBOX_CHANGE_EVENT_NAME, handleChange)
  }
}