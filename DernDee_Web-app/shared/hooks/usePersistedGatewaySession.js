import { useCallback, useEffect, useRef } from 'react'

export function usePersistedGatewaySession({
  wsRef,
  userId,
  isConnected,
  shouldStart,
  shouldComplete,
  sessionType,
  buildSummary,
  buildDetails,
  metadata,
}) {
  const sessionStartedRef = useRef(false)
  const summaryBuilderRef = useRef(buildSummary)
  const detailsBuilderRef = useRef(buildDetails)
  const metadataRef = useRef(metadata || {})

  useEffect(() => {
    summaryBuilderRef.current = buildSummary
  }, [buildSummary])

  useEffect(() => {
    detailsBuilderRef.current = buildDetails
  }, [buildDetails])

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
    }
  }, [isConnected, sendControlMessage, sessionType, shouldStart, userId])

  const endSessionIfActive = useCallback(() => {
    if (!sessionStartedRef.current) {
      return false
    }

    const didSend = sendControlMessage('END_SESSION', {
      summary: summaryBuilderRef.current?.() || {},
      details: detailsBuilderRef.current?.() || {},
    })

    if (didSend) {
      sessionStartedRef.current = false
    }

    return didSend
  }, [sendControlMessage])

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