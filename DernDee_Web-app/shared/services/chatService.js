import { getSupabaseClient } from '@shared/supabase/client.js'
import { fetchDoctorDashboardData } from './sessionService.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PROFILE_COLUMNS = `
  id,
  role,
  full_name,
  email,
  avatar_url,
  phone
`

const THREAD_COLUMNS = `
  id,
  doctor_id,
  patient_id,
  last_message_at,
  last_message_text,
  last_message_sender_id,
  doctor_last_read_at,
  patient_last_read_at,
  created_at,
  updated_at
`

const MESSAGE_COLUMNS = `
  id,
  thread_id,
  sender_id,
  sender_role,
  body,
  message_type,
  payload,
  created_at
`

function isMissingRelationError(error, relationName) {
  if (!error) {
    return false
  }

  const relation = `public.${relationName}`
  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')

  return error.code === 'PGRST205'
    || message.includes(`'${relation}'`)
    || message.includes(`"${relation}"`)
    || message.includes(`relation ${relation}`)
}

function normalizeProfile(profile) {
  if (!profile) {
    return null
  }

  return {
    id: profile.id,
    role: profile.role || 'patient',
    name: profile.full_name || profile.email || 'Unnamed user',
    email: profile.email || '',
    avatarUrl: profile.avatar_url || null,
    phone: profile.phone || '',
    patientId: String(profile.id || '').slice(0, 8),
  }
}

function mapThread(row) {
  if (!row) {
    return null
  }

  return {
    id: row.id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
    lastMessageText: row.last_message_text || '',
    lastMessageSenderId: row.last_message_sender_id || null,
    doctorLastReadAt: row.doctor_last_read_at ? new Date(row.doctor_last_read_at) : null,
    patientLastReadAt: row.patient_last_read_at ? new Date(row.patient_last_read_at) : null,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }
}

function normalizePayload(payload) {
  if (!payload) {
    return {}
  }

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
}

export function mapChatMessage(row) {
  if (!row) {
    return null
  }

  const payload = normalizePayload(row.payload)
  const messageType = row.message_type || 'text'

  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    sender: row.sender_role,
    text: row.body,
    messageType,
    payload,
    isAnalysisResult: messageType === 'analysis',
    analysisData: messageType === 'analysis' ? payload : null,
    timestamp: row.created_at ? new Date(row.created_at) : new Date(),
  }
}

function hasUnreadForViewer(thread, viewerId) {
  if (!thread?.lastMessageAt || !thread.lastMessageSenderId || thread.lastMessageSenderId === viewerId) {
    return false
  }

  const lastReadAt = viewerId === thread.doctorId
    ? thread.doctorLastReadAt
    : thread.patientLastReadAt

  if (!lastReadAt) {
    return true
  }

  return thread.lastMessageAt.getTime() > lastReadAt.getTime()
}

function formatChatError(error, fallback) {
  if (isMissingRelationError(error, 'chat_threads') || isMissingRelationError(error, 'chat_messages')) {
    return new Error('Telemedicine chat tables are missing. Apply the latest Supabase migration and try again.')
  }

  if (error?.code === '42501') {
    return new Error('This chat is only available after the doctor links the patient user ID on the dashboard.')
  }

  return error instanceof Error ? error : new Error(error?.message || fallback)
}

export function formatChatTime(timestamp) {
  const date = timestamp instanceof Date
    ? timestamp
    : timestamp?.toDate
      ? timestamp.toDate()
      : new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function getProfileInitials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) {
    return '?'
  }

  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('')
}

export function formatAnalysisMessageBody(session) {
  const dateLabel = session.date instanceof Date
    ? session.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : session.date || 'Recent session'

  return [
    `Analysis Result - ${session.sessionLabel || 'Therapy Session'}`,
    dateLabel,
    `Cadence: ${session.cadence || 0} steps/min`,
    `Step Length: ${Number(session.stepLength || 0).toFixed(2)} m`,
    `Stride Length: ${Number(session.strideLength || 0).toFixed(2)} m`,
    `Walking Speed: ${Number(session.walkingSpeed || 0).toFixed(2)} m/s`,
    `Duration: ${session.duration || '-'}`,
    `Total Steps: ${session.totalSteps || 0}`,
  ].join('\n')
}

export function buildAnalysisPayload(session) {
  return {
    sessionId: session.id,
    date: session.date instanceof Date ? session.date.toISOString() : session.date || null,
    sessionLabel: session.sessionLabel || 'Therapy Session',
    cadence: session.cadence || 0,
    stepLength: Number(session.stepLength || 0),
    strideLength: Number(session.strideLength || 0),
    walkingSpeed: Number(session.walkingSpeed || 0),
    duration: session.duration || '-',
    totalSteps: session.totalSteps || 0,
  }
}

export async function fetchAssignedDoctorProfiles(patientId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('doctor_patient_assignments')
    .select('doctor_id, assigned_at')
    .eq('patient_id', patientId)
    .order('assigned_at', { ascending: false })

  if (error) {
    throw formatChatError(error, 'Failed to load assigned doctors')
  }

  const doctorIds = (data || []).map((row) => row.doctor_id)
  if (!doctorIds.length) {
    return []
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', doctorIds)

  if (profilesError) {
    throw formatChatError(profilesError, 'Failed to load doctor profiles')
  }

  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]))

  return doctorIds
    .map((doctorId) => normalizeProfile(profileById.get(doctorId)))
    .filter(Boolean)
}

export async function fetchChatThread(doctorId, patientId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_threads')
    .select(THREAD_COLUMNS)
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) {
    throw formatChatError(error, 'Failed to load conversation')
  }

  return mapThread(data)
}

export async function getOrCreateChatThread({ doctorId, patientId }) {
  if (!doctorId || !patientId) {
    throw new Error('A linked doctor and patient are required to open chat')
  }

  if (!UUID_PATTERN.test(doctorId) || !UUID_PATTERN.test(patientId)) {
    throw new Error('Doctor and patient IDs must be valid user IDs')
  }

  const existing = await fetchChatThread(doctorId, patientId)
  if (existing) {
    return existing
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_threads')
    .insert({
      doctor_id: doctorId,
      patient_id: patientId,
    })
    .select(THREAD_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      const raced = await fetchChatThread(doctorId, patientId)
      if (raced) {
        return raced
      }
    }

    throw formatChatError(error, 'Failed to start conversation')
  }

  return mapThread(data)
}

export async function fetchChatMessages(threadId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) {
    throw formatChatError(error, 'Failed to load messages')
  }

  return (data || []).map(mapChatMessage)
}

export async function sendChatMessage({
  threadId,
  senderId,
  senderRole,
  body,
  messageType = 'text',
  payload = {},
}) {
  const text = String(body || '').trim()
  if (!text) {
    throw new Error('Message cannot be empty')
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      sender_id: senderId,
      sender_role: senderRole,
      body: text,
      message_type: messageType,
      payload,
    })
    .select(MESSAGE_COLUMNS)
    .single()

  if (error) {
    throw formatChatError(error, 'Failed to send message')
  }

  return mapChatMessage(data)
}

export async function markChatThreadRead(threadId) {
  if (!threadId) {
    return
  }

  const supabase = getSupabaseClient()
  const { error } = await supabase.rpc('mark_chat_thread_read', {
    target_thread_id: threadId,
  })

  if (error) {
    throw formatChatError(error, 'Failed to mark conversation as read')
  }
}

export async function fetchDoctorChatInbox(doctorId) {
  const [{ recentPatients }, supabase] = await Promise.all([
    fetchDoctorDashboardData(doctorId),
    Promise.resolve(getSupabaseClient()),
  ])

  const { data, error } = await supabase
    .from('chat_threads')
    .select(THREAD_COLUMNS)
    .eq('doctor_id', doctorId)

  if (error) {
    throw formatChatError(error, 'Failed to load doctor inbox')
  }

  const threadByPatientId = new Map((data || []).map((row) => [row.patient_id, mapThread(row)]))

  return recentPatients
    .map((patient) => {
      const thread = threadByPatientId.get(patient.id) || null
      return {
        ...patient,
        avatarUrl: patient.avatarUrl || null,
        thread,
        lastMessageText: thread?.lastMessageText || '',
        lastMessageAt: thread?.lastMessageAt || null,
        hasUnread: thread ? hasUnreadForViewer(thread, doctorId) : false,
      }
    })
    .sort((left, right) => {
      const leftTime = left.lastMessageAt?.getTime() || 0
      const rightTime = right.lastMessageAt?.getTime() || 0
      return rightTime - leftTime
    })
}

export function subscribeToChatThread(threadId, { onMessage, onThreadChange } = {}) {
  const supabase = getSupabaseClient()
  const channel = supabase
    .channel(`telemedicine-chat-${threadId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages',
      filter: `thread_id=eq.${threadId}`,
    }, (payload) => {
      const mapped = mapChatMessage(payload.new)
      if (mapped && typeof onMessage === 'function') {
        onMessage(mapped)
      }
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'chat_threads',
      filter: `id=eq.${threadId}`,
    }, (payload) => {
      const mapped = mapThread(payload.new)
      if (mapped && typeof onThreadChange === 'function') {
        onThreadChange(mapped)
      }
    })
    .subscribe()

  return channel
}

export function subscribeToDoctorInbox(doctorId, onChange) {
  const supabase = getSupabaseClient()
  return supabase
    .channel(`telemedicine-inbox-${doctorId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'chat_threads',
      filter: `doctor_id=eq.${doctorId}`,
    }, onChange)
    .subscribe()
}

export async function removeChatSubscription(channel) {
  if (!channel) {
    return
  }

  const supabase = getSupabaseClient()
  await supabase.removeChannel(channel)
}
