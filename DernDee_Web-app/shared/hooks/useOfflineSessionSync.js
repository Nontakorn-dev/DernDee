import { useCallback, useEffect, useState } from 'react'

import {
  flushPendingFrontendSessions,
  getPendingFrontendSessionCount,
} from '@shared/services/sessionService.js'
import { subscribeToPendingSessionOutbox } from '@shared/services/sessionOutbox.js'

function getNavigatorOnlineState() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useOfflineSessionSync({ enabled = true } = {}) {
  const [isOnline, setIsOnline] = useState(getNavigatorOnlineState)
  const [pendingSessionCount, setPendingSessionCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

  const refreshPendingCount = useCallback(async () => {
    try {
      const total = await getPendingFrontendSessionCount()
      setPendingSessionCount(total)
      return total
    } catch (error) {
      console.error('Failed to read pending offline session count:', error)
      return 0
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (!enabled) {
      const total = await refreshPendingCount()
      return {
        syncedCount: 0,
        failedCount: 0,
        pendingCount: total,
      }
    }

    if (!getNavigatorOnlineState()) {
      const total = await refreshPendingCount()
      setIsOnline(false)
      return {
        syncedCount: 0,
        failedCount: 0,
        pendingCount: total,
      }
    }

    setIsOnline(true)
    setIsSyncing(true)

    try {
      const result = await flushPendingFrontendSessions()
      setPendingSessionCount(result.pendingCount)
      if (result.syncedCount > 0) {
        setLastSyncedAt(new Date().toISOString())
      }
      return result
    } finally {
      setIsSyncing(false)
    }
  }, [enabled, refreshPendingCount])

  useEffect(() => {
    void refreshPendingCount()
  }, [refreshPendingCount])

  useEffect(() => {
    const unsubscribe = subscribeToPendingSessionOutbox(() => {
      void refreshPendingCount()
    })

    return unsubscribe
  }, [refreshPendingCount])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      void syncNow()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (enabled) {
      void syncNow()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [enabled, syncNow])

  return {
    isOnline,
    pendingSessionCount,
    isSyncing,
    lastSyncedAt,
    syncNow,
  }
}