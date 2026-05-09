import { getSupabaseClient } from '@shared/supabase/client.js'
import {
  countPendingSessions,
  enqueuePendingSession,
  isPendingSessionOutboxSupported,
  listPendingSessions,
  removePendingSession,
  updatePendingSessionSyncState,
} from './sessionOutbox.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const LEGACY_SESSION_COLUMNS = `
  id,
  patient_id,
  gateway_session_id,
  session_type,
  start_time,
  end_time,
  duration_seconds,
  total_steps,
  avg_speed_mps,
  cadence_spm,
  avg_step_length_m,
  avg_stride_length_m,
  avg_clearance_m,
  symmetry_score,
  status,
  review_notes,
  reviewed_by,
  reviewed_at,
  created_at
`

const SESSION_COLUMNS = `${LEGACY_SESSION_COLUMNS.trim()},
  details
`

const PROFILE_COLUMNS = `
  id,
  role,
  full_name,
  email,
  avatar_url,
  phone,
  date_of_birth,
  gender,
  created_at
`

const METRIC_COLUMNS = `
  id,
  session_id,
  recorded_at,
  side,
  step_index,
  step_length_m,
  stride_length_m,
  step_time_s,
  swing_time_s,
  stance_time_s,
  stride_time_s,
  max_clearance_m,
  speed_mps,
  symmetry_percent,
  push_off_velocity_mps,
  touchdown_pitch_deg
`

const toDate = (value) => value ? new Date(value) : new Date()

const formatDuration = (durationSeconds = 0) => {
  const mins = Math.floor(durationSeconds / 60)
  const secs = durationSeconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const formatDashboardDate = (value) => toDate(value).toLocaleDateString('th-TH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const SESSION_TYPE_CONFIG = {
  free_walk: {
    label: 'Free Walk',
    description: 'General walking session',
    tone: 'blue',
  },
  high_stepper: {
    label: 'High Stepper',
    description: 'Lift training with target clearance',
    tone: 'emerald',
  },
  magic_plate: {
    label: 'Magic Plate',
    description: 'Balance and center-control training',
    tone: 'amber',
  },
  rhythm_drummer: {
    label: 'Rhythm Drummer',
    description: 'Cadence and timing training',
    tone: 'violet',
  },
  stepping_stones: {
    label: 'Stepping Stones',
    description: 'Step reach and landing control training',
    tone: 'emerald',
  },
}

const DEFAULT_SESSION_TYPE_CONFIG = {
  label: 'Therapy Session',
  description: 'Session summary',
  tone: 'blue',
}

const toFiniteNumber = (value) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

const normalizeSessionDetails = (details) => {
  if (!details) {
    return {}
  }

  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return typeof details === 'object' && !Array.isArray(details) ? details : {}
}

const formatNumberValue = (value, digits = 0) => {
  const numericValue = toFiniteNumber(value)
  if (numericValue === null) {
    return '-'
  }

  return numericValue.toFixed(digits)
}

const formatCountValue = (value, suffix = '') => {
  const numericValue = toFiniteNumber(value)
  if (numericValue === null) {
    return '-'
  }

  return `${Math.round(numericValue)}${suffix}`
}

const formatPercentValue = (value) => {
  const numericValue = toFiniteNumber(value)
  if (numericValue === null) {
    return '-'
  }

  return `${Math.round(numericValue)}%`
}

const formatSecondsValue = (value) => {
  const numericValue = toFiniteNumber(value)
  if (numericValue === null) {
    return '-'
  }

  return formatDuration(Math.round(numericValue))
}

const getSessionTypeConfig = (sessionType) => SESSION_TYPE_CONFIG[sessionType] || DEFAULT_SESSION_TYPE_CONFIG
const SUMMARY_ONLY_SESSION_TYPES = new Set(['high_stepper', 'magic_plate', 'rhythm_drummer'])

const isMissingSessionDetailsColumnError = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return message.includes('details') && (message.includes('column') || message.includes('schema cache') || message.includes('pgrst'))
}

const buildFrontendSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `frontend-${crypto.randomUUID()}`
  }

  return `frontend-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const shouldPersistGaitMetrics = (sessionType) => !SUMMARY_ONLY_SESSION_TYPES.has(sessionType)

const hasNetworkConnection = () => typeof navigator === 'undefined' || navigator.onLine !== false

const formatSessionSyncError = (error) => ({
  message: error?.message || 'Session sync failed',
  code: error?.code || null,
  details: error?.details || null,
  hint: error?.hint || null,
  status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
})

const normalizeGaitMetricsInsertRow = (row, stepIndex) => {
  if (!row || typeof row !== 'object') {
    return null
  }

  return {
    recorded_at: row.recorded_at || new Date().toISOString(),
    side: row.side === 'left' || row.side === 'right' ? row.side : null,
    step_index: Number.isFinite(Number(row.step_index)) ? Number(row.step_index) : stepIndex,
    step_length_m: toFiniteNumber(row.step_length_m),
    stride_length_m: toFiniteNumber(row.stride_length_m),
    step_time_s: toFiniteNumber(row.step_time_s),
    swing_time_s: toFiniteNumber(row.swing_time_s),
    stance_time_s: toFiniteNumber(row.stance_time_s),
    stride_time_s: toFiniteNumber(row.stride_time_s),
    max_clearance_m: toFiniteNumber(row.max_clearance_m),
    speed_mps: toFiniteNumber(row.speed_mps),
    symmetry_percent: toFiniteNumber(row.symmetry_percent),
    push_off_velocity_mps: toFiniteNumber(row.push_off_velocity_mps),
    touchdown_pitch_deg: toFiniteNumber(row.touchdown_pitch_deg),
    raw_payload: typeof row.raw_payload === 'object' && row.raw_payload && !Array.isArray(row.raw_payload)
      ? row.raw_payload
      : {},
  }
}

const buildSessionCardMetrics = (session) => {
  const details = session.details || {}

  if (session.sessionType === 'high_stepper') {
    const liftSuccess = toFiniteNumber(details.red_line_hits) ?? toFiniteNumber(session.totalSteps)
    const targetReps = toFiniteNumber(details.target_reps)

    return [
      {
        label: 'Red Line Hits',
        value: formatCountValue(liftSuccess, ' times'),
      },
      {
        label: 'Avg Cadence',
        value: session.cadence ? `${session.cadence} /min` : '-',
      },
      {
        label: 'Target Height',
        value: toFiniteNumber(details.target_height_cm) !== null ? `${formatNumberValue(details.target_height_cm)} cm` : '-',
      },
      {
        label: 'Goal Progress',
        value: targetReps !== null && liftSuccess !== null
          ? `${Math.round(liftSuccess)} / ${Math.round(targetReps)}`
          : formatPercentValue(details.goal_progress_percent),
      },
    ]
  }

  if (session.sessionType === 'magic_plate') {
    return [
      {
        label: 'Center Hold',
        value: formatPercentValue(details.center_hold_percent),
      },
      {
        label: 'Avg Deviation',
        value: toFiniteNumber(details.avg_deviation_deg) !== null ? `${formatNumberValue(details.avg_deviation_deg, 1)}°` : '-',
      },
      {
        label: 'Perfect Zone',
        value: formatSecondsValue(details.time_in_zone_a_seconds),
      },
      {
        label: 'Unstable Zone',
        value: formatSecondsValue(details.time_in_zone_c_seconds),
      },
    ]
  }

  if (session.sessionType === 'rhythm_drummer') {
    const targetScore = toFiniteNumber(details.target_score)
    const score = toFiniteNumber(details.score)

    return [
      {
        label: 'Score',
        value: targetScore !== null && score !== null ? `${Math.round(score)} / ${Math.round(targetScore)}` : formatCountValue(score),
      },
      {
        label: 'Best Streak',
        value: formatCountValue(details.best_streak),
      },
      {
        label: 'Avg Cadence',
        value: session.cadence ? `${session.cadence} /min` : '-',
      },
      {
        label: 'Target Tempo',
        value: toFiniteNumber(details.target_bpm) !== null ? `${formatNumberValue(details.target_bpm)} BPM` : '-',
      },
    ]
  }

  if (session.sessionType === 'stepping_stones') {
    const completedLandings = toFiniteNumber(details.completed_landings)
    const targetLandings = toFiniteNumber(details.target_landings)
    const targetStepCm = toFiniteNumber(details.target_step_cm)

    return [
      {
        label: 'Landings',
        value: completedLandings !== null && targetLandings !== null
          ? `${Math.round(completedLandings)} / ${Math.round(targetLandings)}`
          : formatCountValue(completedLandings),
      },
      {
        label: 'Target Reach',
        value: targetStepCm !== null ? `${formatNumberValue(targetStepCm)} cm` : '-',
      },
      {
        label: 'Mission Progress',
        value: formatPercentValue(details.progress_percent),
      },
      {
        label: 'Avg Stride',
        value: toFiniteNumber(session.strideLength) !== null ? `${formatNumberValue(session.strideLength, 2)} m` : '-',
      },
    ]
  }

  return [
    {
      label: 'Cadence',
      value: session.cadence ? `${session.cadence} /min` : '-',
    },
    {
      label: 'Speed',
      value: `${session.walkingSpeed} m/s`,
    },
    {
      label: 'Duration',
      value: session.duration,
    },
    {
      label: 'Steps',
      value: formatCountValue(session.totalSteps),
    },
  ]
}

async function executeSessionQuery(queryFactory) {
  let response = await queryFactory(SESSION_COLUMNS)

  if (response.error && isMissingSessionDetailsColumnError(response.error)) {
    response = await queryFactory(LEGACY_SESSION_COLUMNS)
  }

  return response
}

function buildNormalizedFrontendSessionRecord({
  patientId,
  sessionType,
  summary = {},
  details = {},
  gaitMetricsRows = [],
  metadata = {},
  source = 'frontend',
  startedAt = null,
  endedAt = null,
  gatewaySessionId = null,
}) {
  const startTime = startedAt ? new Date(startedAt) : new Date()
  const endTime = endedAt ? new Date(endedAt) : new Date()
  const durationSeconds = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 1000))
  const detailsPayload = {
    ...normalizeSessionDetails(details),
  }

  if (metadata?.game_label && !detailsPayload.game_label) {
    detailsPayload.game_label = metadata.game_label
  }

  const normalizedSessionType = sessionType || 'free_walk'
  const normalizedGatewaySessionId = gatewaySessionId || buildFrontendSessionId()
  const normalizedRows = shouldPersistGaitMetrics(normalizedSessionType)
    ? gaitMetricsRows
      .map((row, index) => normalizeGaitMetricsInsertRow(row, index + 1))
      .filter(Boolean)
    : []

  return {
    id: normalizedGatewaySessionId,
    gatewaySessionId: normalizedGatewaySessionId,
    patientId,
    sessionType: normalizedSessionType,
    source,
    startedAt: startTime.toISOString(),
    endedAt: endTime.toISOString(),
    durationSeconds,
    summary: {
      total_steps: Math.max(0, Math.round(toFiniteNumber(summary.total_steps) || 0)),
      avg_speed_mps: toFiniteNumber(summary.avg_speed_mps),
      cadence_spm: toFiniteNumber(summary.cadence_spm),
      avg_step_length_m: toFiniteNumber(summary.avg_step_length_m),
      avg_stride_length_m: toFiniteNumber(summary.avg_stride_length_m),
      avg_clearance_m: toFiniteNumber(summary.avg_clearance_m),
      symmetry_score: toFiniteNumber(summary.symmetry_score),
    },
    details: detailsPayload,
    gaitMetricsRows: normalizedRows,
    metadata: typeof metadata === 'object' && metadata && !Array.isArray(metadata) ? { ...metadata } : {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncAttempts: 0,
    lastSyncError: null,
    lastSyncAttemptAt: null,
  }
}

function buildSessionRowFromRecord(record) {
  return {
    patient_id: record.patientId,
    gateway_session_id: record.gatewaySessionId,
    source: record.source,
    session_type: record.sessionType,
    start_time: record.startedAt,
    end_time: record.endedAt,
    duration_seconds: record.durationSeconds,
    total_steps: record.summary?.total_steps ?? 0,
    avg_speed_mps: record.summary?.avg_speed_mps ?? null,
    cadence_spm: record.summary?.cadence_spm ?? null,
    avg_step_length_m: record.summary?.avg_step_length_m ?? null,
    avg_stride_length_m: record.summary?.avg_stride_length_m ?? null,
    avg_clearance_m: record.summary?.avg_clearance_m ?? null,
    symmetry_score: record.summary?.symmetry_score ?? null,
    details: record.details || {},
  }
}

async function insertFrontendSessionRecord(record) {
  const supabase = getSupabaseClient()
  const sessionRow = buildSessionRowFromRecord(record)

  let insertResponse = await supabase
    .from('sessions')
    .insert(sessionRow)
    .select('id')
    .single()

  if (insertResponse.error && isMissingSessionDetailsColumnError(insertResponse.error)) {
    const fallbackRow = { ...sessionRow }
    delete fallbackRow.details
    insertResponse = await supabase
      .from('sessions')
      .insert(fallbackRow)
      .select('id')
      .single()
  }

  if (insertResponse.error) {
    throw insertResponse.error
  }

  const sessionId = insertResponse.data?.id

  if (sessionId && record.gaitMetricsRows.length) {
    const { error } = await supabase
      .from('gait_metrics')
      .insert(record.gaitMetricsRows.map((row) => ({
        ...row,
        session_id: sessionId,
      })))

    if (error) {
      throw error
    }
  }

  return {
    sessionId,
    savedMetricsCount: record.gaitMetricsRows.length,
    sessionRow,
  }
}

async function syncPendingSessionRecord(record) {
  const syncResult = await insertFrontendSessionRecord(record)
  await removePendingSession(record.id)
  return syncResult
}

export async function flushPendingFrontendSessions() {
  if (!hasNetworkConnection()) {
    return {
      syncedCount: 0,
      failedCount: 0,
      pendingCount: await countPendingSessions(),
    }
  }

  const pendingRecords = await listPendingSessions()
  let syncedCount = 0
  let failedCount = 0

  for (const record of pendingRecords) {
    try {
      await syncPendingSessionRecord(record)
      syncedCount += 1
    } catch (error) {
      failedCount += 1
      await updatePendingSessionSyncState(record.id, {
        syncAttempts: Number(record.syncAttempts || 0) + 1,
        lastSyncAttemptAt: new Date().toISOString(),
        lastSyncError: formatSessionSyncError(error),
        updatedAt: new Date().toISOString(),
      })
    }
  }

  return {
    syncedCount,
    failedCount,
    pendingCount: await countPendingSessions(),
  }
}

export async function getPendingFrontendSessionCount() {
  return countPendingSessions()
}

export async function persistSessionFromFrontend({
  patientId,
  sessionType,
  summary = {},
  details = {},
  gaitMetricsRows = [],
  metadata = {},
  source = 'frontend',
  startedAt = null,
  endedAt = null,
  gatewaySessionId = null,
}) {
  if (!patientId) {
    throw new Error('patientId is required to persist a session')
  }

  const record = buildNormalizedFrontendSessionRecord({
    patientId,
    sessionType,
    summary,
    details,
    gaitMetricsRows,
    metadata,
    source,
    startedAt,
    endedAt,
    gatewaySessionId,
  })

  let storedOffline = false
  if (isPendingSessionOutboxSupported()) {
    storedOffline = await enqueuePendingSession(record)
  }

  if (!hasNetworkConnection()) {
    return {
      sessionId: null,
      savedMetricsCount: record.gaitMetricsRows.length,
      sessionRow: buildSessionRowFromRecord(record),
      gatewaySessionId: record.gatewaySessionId,
      syncStatus: storedOffline ? 'queued' : 'pending-online',
      queued: storedOffline,
    }
  }

  try {
    const syncResult = await syncPendingSessionRecord(record)
    return {
      ...syncResult,
      gatewaySessionId: record.gatewaySessionId,
      syncStatus: 'synced',
      queued: false,
    }
  } catch (error) {
    if (storedOffline) {
      await updatePendingSessionSyncState(record.id, {
        syncAttempts: 1,
        lastSyncAttemptAt: new Date().toISOString(),
        lastSyncError: formatSessionSyncError(error),
        updatedAt: new Date().toISOString(),
      })

      return {
        sessionId: null,
        savedMetricsCount: record.gaitMetricsRows.length,
        sessionRow: buildSessionRowFromRecord(record),
        gatewaySessionId: record.gatewaySessionId,
        syncStatus: 'queued',
        queued: true,
        syncError: formatSessionSyncError(error),
      }
    }

    throw error
  }
}

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) {
    return null
  }

  const birthDate = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDifference = today.getMonth() - birthDate.getMonth()

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

const computeProgress = (sessions) => {
  if (!sessions.length) {
    return 0
  }

  const symmetryValues = sessions
    .map((session) => session.symmetry_score)
    .filter((value) => Number.isFinite(value))

  if (!symmetryValues.length) {
    return Math.min(100, sessions.length * 10)
  }

  const average = symmetryValues.reduce((sum, value) => sum + value, 0) / symmetryValues.length
  return Math.round(Math.max(0, Math.min(100, average)))
}

const mapSessionRow = (session) => {
  const startTime = toDate(session.start_time)
  const endTime = toDate(session.end_time)
  const details = normalizeSessionDetails(session.details)
  const sessionTypeConfig = getSessionTypeConfig(session.session_type)

  const mappedSession = {
    id: session.id,
    patientId: session.patient_id,
    sessionType: session.session_type,
    sessionLabel: sessionTypeConfig.label,
    sessionDescription: sessionTypeConfig.description,
    sessionTone: sessionTypeConfig.tone,
    cadence: Math.round(session.cadence_spm || 0),
    stepLength: Number(session.avg_step_length_m || 0),
    strideLength: Number(session.avg_stride_length_m || 0),
    walkingSpeed: Number(session.avg_speed_mps || 0),
    clearance: Number(session.avg_clearance_m || 0),
    symmetryScore: Number(session.symmetry_score || 0),
    duration: formatDuration(session.duration_seconds || 0),
    durationSeconds: session.duration_seconds || 0,
    totalSteps: session.total_steps || 0,
    status: session.status || 'pending',
    reviewNotes: session.review_notes || '',
    createdAt: startTime,
    date: startTime,
    startTime,
    endTime,
    details,
    time: startTime.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    raw: session,
  }

  return {
    ...mappedSession,
    cardMetrics: buildSessionCardMetrics(mappedSession),
  }
}

async function fetchAssignedPatientIds(doctorId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('doctor_patient_assignments')
    .select('patient_id')
    .eq('doctor_id', doctorId)

  if (error) {
    throw error
  }

  return (data || []).map((row) => row.patient_id)
}

async function assertDoctorAssignment(doctorId, patientId) {
  const patientIds = await fetchAssignedPatientIds(doctorId)
  if (!patientIds.includes(patientId)) {
    throw new Error('Patient is not assigned to the current doctor')
  }
}

async function fetchDoctorPatientAssignment(doctorId, patientId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('doctor_patient_assignments')
    .select('doctor_id, patient_id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function addDoctorPatientAssignment(doctorId, rawPatientId) {
  const patientId = String(rawPatientId || '').trim()

  if (!doctorId) {
    throw new Error('Doctor account is not available yet')
  }

  if (!patientId) {
    throw new Error('Enter a patient user ID before adding a patient')
  }

  if (!UUID_PATTERN.test(patientId)) {
    throw new Error('Enter the full patient user ID in UUID format')
  }

  if (patientId === doctorId) {
    throw new Error('Doctor and patient IDs must be different')
  }

  const supabase = getSupabaseClient()
  const existingAssignment = await fetchDoctorPatientAssignment(doctorId, patientId)

  if (existingAssignment) {
    return existingAssignment
  }

  const { data, error } = await supabase
    .from('doctor_patient_assignments')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
      notes: 'Added from doctor dashboard',
    })
    .select('doctor_id, patient_id')
    .single()

  if (error) {
    if (error.code === '23503') {
      throw new Error('Patient ID was not found. Ask the patient to sign in once and verify the full user ID.')
    }

    if (error.code === '42501') {
      throw new Error('Doctor assignments are not enabled in Supabase yet. Apply the latest migration and try again.')
    }

    if (error.code === '23505') {
      const duplicateAssignment = await fetchDoctorPatientAssignment(doctorId, patientId)
      if (duplicateAssignment) {
        return duplicateAssignment
      }
    }

    throw error
  }

  return data
}

export async function fetchPatientHistorySessions(patientId) {
  const supabase = getSupabaseClient()
  const { data, error } = await executeSessionQuery((columns) => supabase
    .from('sessions')
    .select(columns)
    .eq('patient_id', patientId)
    .order('start_time', { ascending: false }))

  if (error) {
    throw error
  }

  return (data || []).map(mapSessionRow)
}

export async function fetchLatestPatientSession(patientId) {
  const supabase = getSupabaseClient()
  const { data, error } = await executeSessionQuery((columns) => supabase
    .from('sessions')
    .select(columns)
    .eq('patient_id', patientId)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle())

  if (error) {
    throw error
  }

  return data ? mapSessionRow(data) : null
}

export async function fetchPatientDailyProgress(patientId, defaultTargetSteps = 500) {
  const supabase = getSupabaseClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(startOfDay)
  endOfDay.setDate(endOfDay.getDate() + 1)

  const { data, error } = await supabase
    .from('sessions')
    .select('total_steps, start_time')
    .eq('patient_id', patientId)
    .gte('start_time', startOfDay.toISOString())
    .lt('start_time', endOfDay.toISOString())

  if (error) {
    throw error
  }

  const currentSteps = (data || []).reduce((sum, session) => sum + Number(session.total_steps || 0), 0)

  return {
    currentSteps,
    sessionCount: (data || []).length,
    targetSteps: defaultTargetSteps,
  }
}

export async function fetchDoctorDashboardData(doctorId) {
  const supabase = getSupabaseClient()
  const patientIds = await fetchAssignedPatientIds(doctorId)

  if (!patientIds.length) {
    return {
      recentPatients: [],
      stats: {
        totalPatients: 0,
        activeSessions: 0,
        pendingReviews: 0,
        completedToday: 0,
      },
    }
  }

  const [{ data: profiles, error: profilesError }, { data: presenceRows, error: presenceError }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).in('id', patientIds),
    supabase.from('patient_presence').select('patient_id, is_online, current_session_type, last_seen_at').in('patient_id', patientIds),
    executeSessionQuery((columns) => supabase.from('sessions').select(columns).in('patient_id', patientIds).order('start_time', { ascending: false })),
  ])

  if (profilesError) {
    throw profilesError
  }

  if (presenceError) {
    throw presenceError
  }

  if (sessionsError) {
    throw sessionsError
  }

  const presenceByPatientId = new Map((presenceRows || []).map((row) => [row.patient_id, row]))
  const sessionsByPatientId = new Map()
  const latestSessionByPatientId = new Map()

  for (const session of sessions || []) {
    const existing = sessionsByPatientId.get(session.patient_id) || []
    existing.push(session)
    sessionsByPatientId.set(session.patient_id, existing)

    if (!latestSessionByPatientId.has(session.patient_id)) {
      latestSessionByPatientId.set(session.patient_id, session)
    }
  }

  const recentPatients = (profiles || [])
    .map((profile) => {
      const patientSessions = sessionsByPatientId.get(profile.id) || []
      const latestSession = latestSessionByPatientId.get(profile.id)
      const presence = presenceByPatientId.get(profile.id)
      const status = latestSession?.status === 'pending' || latestSession?.status === 'needs_attention'
        ? 'review'
        : presence?.is_online
          ? 'active'
          : 'completed'

      return {
        id: profile.id,
        name: profile.full_name || profile.email || 'Unnamed Patient',
        patientId: profile.id.slice(0, 8),
        lastSession: latestSession ? formatDashboardDate(latestSession.start_time) : 'No session yet',
        progress: computeProgress(patientSessions),
        status,
      }
    })
    .sort((left, right) => {
      const leftSession = latestSessionByPatientId.get(left.id)
      const rightSession = latestSessionByPatientId.get(right.id)
      return toDate(rightSession?.start_time).getTime() - toDate(leftSession?.start_time).getTime()
    })

  const today = new Date().toDateString()
  const stats = {
    totalPatients: patientIds.length,
    activeSessions: (presenceRows || []).filter((row) => row.is_online).length,
    pendingReviews: (sessions || []).filter((session) => session.status === 'pending' || session.status === 'needs_attention').length,
    completedToday: (sessions || []).filter((session) => toDate(session.end_time).toDateString() === today).length,
  }

  return { recentPatients, stats }
}

export async function fetchDoctorPatientDetail(doctorId, patientId) {
  const supabase = getSupabaseClient()
  await assertDoctorAssignment(doctorId, patientId)

  const [{ data: patientProfile, error: patientError }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', patientId).single(),
    executeSessionQuery((columns) => supabase.from('sessions').select(columns).eq('patient_id', patientId).order('start_time', { ascending: false })),
  ])

  if (patientError) {
    throw patientError
  }

  if (sessionsError) {
    throw sessionsError
  }

  const mappedSessions = (sessions || []).map(mapSessionRow).map((session) => ({
    ...session,
    date: formatDashboardDate(session.startTime),
    status: session.status === 'pending' ? 'pending' : 'reviewed',
  }))

  return {
    patient: {
      id: patientProfile.id,
      name: patientProfile.full_name || patientProfile.email || 'Unnamed Patient',
      patientId: patientProfile.id.slice(0, 8),
      email: patientProfile.email || '-',
      phone: patientProfile.phone || '-',
      age: calculateAge(patientProfile.date_of_birth) || '-',
      gender: patientProfile.gender || 'Unspecified',
      startDate: formatDashboardDate(patientProfile.created_at),
      totalSessions: mappedSessions.length,
      progress: computeProgress(sessions || []),
    },
    sessions: mappedSessions,
  }
}

export async function fetchDoctorSessionReview(doctorId, patientId, sessionId) {
  const supabase = getSupabaseClient()
  await assertDoctorAssignment(doctorId, patientId)

  const [{ data: patientProfile, error: patientError }, { data: session, error: sessionError }, { data: gaitMetrics, error: gaitMetricsError }] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', patientId).single(),
    executeSessionQuery((columns) => supabase.from('sessions').select(columns).eq('id', sessionId).eq('patient_id', patientId).single()),
    supabase.from('gait_metrics').select(METRIC_COLUMNS).eq('session_id', sessionId).order('recorded_at', { ascending: true }),
  ])

  if (patientError) {
    throw patientError
  }

  if (sessionError) {
    throw sessionError
  }

  if (gaitMetricsError) {
    throw gaitMetricsError
  }

  const mappedSession = mapSessionRow(session)

  return {
    patient: {
      id: patientProfile.id,
      name: patientProfile.full_name || patientProfile.email || 'Unnamed Patient',
      patientId: patientProfile.id.slice(0, 8),
    },
    session: {
      ...mappedSession,
      date: formatDashboardDate(mappedSession.startTime),
      gaitMetrics: gaitMetrics || [],
    },
  }
}

export async function saveDoctorSessionReview(sessionId, reviewedBy, reviewStatus, reviewNotes) {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('sessions')
    .update({
      status: reviewStatus,
      review_notes: reviewNotes,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('id')
    .single()

  if (error) {
    throw error
  }

  const { data, error: fetchError } = await executeSessionQuery((columns) => supabase
    .from('sessions')
    .select(columns)
    .eq('id', sessionId)
    .single())

  if (fetchError) {
    throw fetchError
  }

  return mapSessionRow(data)
}

export async function downloadSessionMetricsCsv(sessionId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('gait_metrics')
    .select(METRIC_COLUMNS)
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: true })

  if (error) {
    throw error
  }

  const header = [
    'recorded_at',
    'side',
    'step_index',
    'step_length_m',
    'stride_length_m',
    'step_time_s',
    'swing_time_s',
    'stance_time_s',
    'stride_time_s',
    'max_clearance_m',
    'speed_mps',
    'symmetry_percent',
    'push_off_velocity_mps',
    'touchdown_pitch_deg',
  ]

  const rows = (data || []).map((row) => header.map((column) => row[column] ?? '').join(','))
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `gait-metrics-${sessionId}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function createDoctorRealtimeSubscription(onChange) {
  const supabase = getSupabaseClient()
  const channel = supabase
    .channel(`doctor-dashboard-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_presence' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, onChange)
    .subscribe()

  return channel
}

export async function removeRealtimeSubscription(channel) {
  if (!channel) {
    return
  }

  const supabase = getSupabaseClient()
  await supabase.removeChannel(channel)
}