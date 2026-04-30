import { getSupabaseClient } from '@shared/supabase/client.js'

const SESSION_COLUMNS = `
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

  return {
    id: session.id,
    patientId: session.patient_id,
    sessionType: session.session_type,
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
    time: startTime.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    raw: session,
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

export async function fetchPatientHistorySessions(patientId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('patient_id', patientId)
    .order('start_time', { ascending: false })

  if (error) {
    throw error
  }

  return (data || []).map(mapSessionRow)
}

export async function fetchLatestPatientSession(patientId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('patient_id', patientId)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapSessionRow(data) : null
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
    supabase.from('sessions').select(SESSION_COLUMNS).in('patient_id', patientIds).order('start_time', { ascending: false }),
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
    supabase.from('sessions').select(SESSION_COLUMNS).eq('patient_id', patientId).order('start_time', { ascending: false }),
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
    supabase.from('sessions').select(SESSION_COLUMNS).eq('id', sessionId).eq('patient_id', patientId).single(),
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
  const { data, error } = await supabase
    .from('sessions')
    .update({
      status: reviewStatus,
      review_notes: reviewNotes,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select(SESSION_COLUMNS)
    .single()

  if (error) {
    throw error
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