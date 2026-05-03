import { useCallback, useEffect, useRef } from 'react'
import {
  TRANSPORT_MODE_WEB_BLUETOOTH,
  getRealtimeTransportMode,
} from '../gateway/realtimeTransport.js'
import { persistSessionFromFrontend } from '../services/sessionService.js'

export function usePersistedGatewaySession({
  wsRef,
  userId,
  isConnected,
  shouldStart,
  shouldComplete,
  sessionType,
  buildSummary,
  buildDetails,
  buildGaitMetricsRows,
  metadata,
  source = 'frontend',
}) {
  const sessionStartedRef = useRef(false)
  const summaryBuilderRef = useRef(buildSummary)
  const detailsBuilderRef = useRef(buildDetails)
  const gaitMetricsRowsBuilderRef = useRef(buildGaitMetricsRows)
  const metadataRef = useRef(metadata || {})
  const sessionStartedAtRef = useRef(null)

  useEffect(() => {
    summaryBuilderRef.current = buildSummary
  }, [buildSummary])

  useEffect(() => {
    detailsBuilderRef.current = buildDetails
  }, [buildDetails])

  useEffect(() => {
    gaitMetricsRowsBuilderRef.current = buildGaitMetricsRows
  }, [buildGaitMetricsRows])

  useEffect(() => {
    metadataRef.current = metadata || {}
  }, [metadata])

  const sendControlMessage = useCallback((type, payload = {}) => {
    const socket = wsRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    socket.send(JSON.stringify({ type, payload }))
    return true
  }, [wsRef])

  useEffect(() => {
    if (!shouldStart || !isConnected || !userId || sessionStartedRef.current) {
      return
    }

    const didSend = sendControlMessage('START_SESSION', {
      patient_id: userId,
      session_type: sessionType,
      ...metadataRef.current,
    })

    if (didSend) {
      sessionStartedRef.current = true
      sessionStartedAtRef.current = new Date().toISOString()
    }
  }, [isConnected, sendControlMessage, sessionType, shouldStart, userId])

  const endSessionIfActive = useCallback(async () => {
    if (!sessionStartedRef.current) {
      return false
    }

    const summary = summaryBuilderRef.current?.() || {}
    const details = detailsBuilderRef.current?.() || {}
    const gaitMetricsRows = gaitMetricsRowsBuilderRef.current?.() || []
    const isBrowserBleMode = getRealtimeTransportMode() === TRANSPORT_MODE_WEB_BLUETOOTH
    const startedAt = sessionStartedAtRef.current

    sessionStartedRef.current = false
    sessionStartedAtRef.current = null

    const didSend = sendControlMessage('END_SESSION', {
      summary,
      details,
      gait_metrics_rows: gaitMetricsRows,
      source,
    })

    if (!didSend && !isBrowserBleMode) {
      return false
    }

    if (isBrowserBleMode) {
      try {
        await persistSessionFromFrontend({
          patientId: userId,
          sessionType,
          summary,
          details,
          gaitMetricsRows,
          metadata: metadataRef.current,
          source,
          startedAt,
        })
      } catch (error) {
        console.error('Failed to persist Browser BLE session to Supabase:', error)
        return false
      }
    }

    return didSend || isBrowserBleMode
  }, [sendControlMessage, source, sessionType, userId])

  useEffect(() => {
    if (!shouldComplete || !isConnected) {
      return
    }

    endSessionIfActive()
  }, [endSessionIfActive, isConnected, shouldComplete])

  return {
    endSessionIfActive,
    sendControlMessage,
    sessionStartedRef,
  }
}