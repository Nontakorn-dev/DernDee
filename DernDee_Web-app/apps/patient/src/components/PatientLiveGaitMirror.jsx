import React, { useEffect, useRef } from 'react'

import { useUserAuth } from '@shared/context/UserAuthContext.jsx'
import { subscribeToRealtimeMessages } from '@shared/gateway/realtimeTransport.js'
import { createLiveGaitBroadcastPublisher } from '@shared/services/liveGaitBroadcast.js'

function isPatientRole(user, profile) {
  return (profile?.role || user?.role) === 'patient'
}

const LIVE_GAIT_RETRY_DELAY_MS = 2000

const PatientLiveGaitMirror = () => {
  const { user, profile } = useUserAuth()
  const activeSensorKeyRef = useRef(null)
  const activeSensorMountRef = useRef(null)
  const lastPublishedStatusRef = useRef('disconnected')

  useEffect(() => {
    if (!user?.uid || !isPatientRole(user, profile)) {
      activeSensorKeyRef.current = null
      activeSensorMountRef.current = null
      lastPublishedStatusRef.current = 'disconnected'
      return undefined
    }

    const publisher = createLiveGaitBroadcastPublisher({ patientId: user.uid })
    let isCancelled = false
    let reconnectTimerId = null

    const resetActiveSensor = () => {
      activeSensorKeyRef.current = null
      activeSensorMountRef.current = null
    }

    const publishStatus = (status) => {
      if (lastPublishedStatusRef.current === status) {
        return
      }

      lastPublishedStatusRef.current = status
      void publisher.publishStatus(status)
    }

    const scheduleReconnect = () => {
      if (isCancelled || reconnectTimerId) {
        return
      }

      reconnectTimerId = window.setTimeout(() => {
        reconnectTimerId = null
        void connectPublisher()
      }, LIVE_GAIT_RETRY_DELAY_MS)
    }

    const connectPublisher = async () => {
      try {
        await publisher.connect()

        if (isCancelled) {
          return
        }

        publishStatus('disconnected')
      } catch (error) {
        if (isCancelled) {
          return
        }

        console.warn('Live gait mirror is unavailable:', error)
        scheduleReconnect()
      }
    }

    void connectPublisher()

    const unsubscribe = subscribeToRealtimeMessages((message) => {
      if (!message || typeof message !== 'object') {
        return
      }

      if (message.type === 'SYSTEM_RESET') {
        resetActiveSensor()
        publishStatus('disconnected')
        return
      }

      if (message.type !== 'DATA') {
        return
      }

      const payload = message.payload || {}

      if (!Array.isArray(payload.raw_accel) || !Array.isArray(payload.raw_gyro)) {
        return
      }

      const streamKey = payload.position_id || payload.name || null
      const isPreferredSensor = payload.sensor_mount === 'shank'
      if (!activeSensorKeyRef.current) {
        activeSensorKeyRef.current = streamKey
        activeSensorMountRef.current = payload.sensor_mount ?? 'unknown'
      } else if (
        isPreferredSensor
        && activeSensorMountRef.current !== 'shank'
        && streamKey
        && streamKey !== activeSensorKeyRef.current
      ) {
        activeSensorKeyRef.current = streamKey
        activeSensorMountRef.current = 'shank'
      }

      if (!streamKey || streamKey !== activeSensorKeyRef.current) {
        return
      }

      publisher.enqueueSample(payload)
      publishStatus('connected')
    })

    return () => {
      isCancelled = true
      if (reconnectTimerId) {
        window.clearTimeout(reconnectTimerId)
      }
      unsubscribe()
      resetActiveSensor()
      lastPublishedStatusRef.current = 'disconnected'
      void publisher.disconnect()
    }
  }, [profile?.role, user, user?.uid])

  return null
}

export default PatientLiveGaitMirror