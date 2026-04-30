import { getProfileImageBucket, getSupabaseClient } from '@shared/supabase/client.js'

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

const PROFILE_COLUMNS = `
  id,
  role,
  full_name,
  email,
  avatar_url,
  phone,
  date_of_birth,
  gender,
  weight_kg,
  height_cm,
  blood_type,
  allergies,
  medical_conditions,
  medications,
  emergency_contact,
  preferences,
  created_at,
  updated_at
`

const toDisplayName = (authUser, profileRow) => {
  return profileRow?.full_name
    || authUser?.user_metadata?.full_name
    || authUser?.user_metadata?.name
    || authUser?.email?.split('@')[0]
    || 'DernDee User'
}

export function normalizeAuthenticatedUser(authUser, profileRow) {
  if (!authUser) {
    return null
  }

  const displayName = toDisplayName(authUser, profileRow)
  const photoURL = profileRow?.avatar_url
    || authUser?.user_metadata?.avatar_url
    || authUser?.user_metadata?.picture
    || null

  return {
    id: authUser.id,
    uid: authUser.id,
    email: authUser.email,
    displayName,
    fullName: displayName,
    photoURL,
    role: profileRow?.role || authUser?.user_metadata?.role || 'patient',
    createdAt: profileRow?.created_at || authUser.created_at || null,
  }
}

export async function fetchProfileById(userId) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    if (isMissingRelationError(error, 'profiles')) {
      return null
    }

    throw error
  }

  return data
}

export async function upsertAuthProfile(authUser, overrides = {}) {
  try {
    const supabase = getSupabaseClient()
    const existingProfile = await fetchProfileById(authUser.id)

    const payload = {
      email: authUser.email,
      full_name: overrides.full_name || toDisplayName(authUser, existingProfile),
      avatar_url: overrides.avatar_url
        || existingProfile?.avatar_url
        || authUser?.user_metadata?.avatar_url
        || authUser?.user_metadata?.picture
        || null,
      role: overrides.role || existingProfile?.role || authUser?.user_metadata?.role || 'patient',
      updated_at: new Date().toISOString(),
    }

    const query = existingProfile
      ? supabase.from('profiles').update(payload).eq('id', authUser.id)
      : supabase.from('profiles').insert({
        id: authUser.id,
        ...payload,
        created_at: new Date().toISOString(),
      })

    const { data, error } = await query.select(PROFILE_COLUMNS).single()

    if (error) {
      if (isMissingRelationError(error, 'profiles')) {
        return null
      }

      throw error
    }

    return data
  } catch (error) {
    if (isMissingRelationError(error, 'profiles')) {
      return null
    }

    throw error
  }
}

export async function updateUserProfile(userId, formData) {
  const supabase = getSupabaseClient()

  const payload = {
    full_name: formData.displayName || '',
    phone: formData.phone || '',
    date_of_birth: formData.dateOfBirth || null,
    gender: formData.gender || null,
    weight_kg: formData.weight ? Number(formData.weight) : null,
    height_cm: formData.height ? Number(formData.height) : null,
    blood_type: formData.bloodType || null,
    allergies: formData.allergies || null,
    medical_conditions: formData.medicalConditions || null,
    medications: formData.medications || null,
    emergency_contact: formData.emergencyContact || {},
    preferences: formData.preferences || {},
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single()

  if (error) {
    if (isMissingRelationError(error, 'profiles')) {
      throw new Error('Supabase profiles table is missing. Apply the migration before editing patient profiles.')
    }

    throw error
  }

  return data
}

export async function uploadProfileImage(userId, file) {
  const supabase = getSupabaseClient()
  const bucket = getProfileImageBucket()
  const fileExtension = file.name.split('.').pop() || 'jpg'
  const filePath = `${userId}/avatar.${fileExtension}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    throw uploadError
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath)
  const avatarUrl = publicUrlData.publicUrl

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (profileError) {
    if (isMissingRelationError(profileError, 'profiles')) {
      throw new Error('Supabase profiles table is missing. Apply the migration before updating profile images.')
    }

    throw profileError
  }

  return avatarUrl
}

export async function upsertPatientPresence(patientId, currentSessionType = null) {
  const supabase = getSupabaseClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('patient_presence')
    .upsert({
      patient_id: patientId,
      is_online: true,
      current_session_type: currentSessionType,
      last_seen_at: now,
      updated_at: now,
    }, {
      onConflict: 'patient_id',
    })

  if (error) {
    if (isMissingRelationError(error, 'patient_presence')) {
      return
    }

    throw error
  }
}

export async function markPatientOffline(patientId) {
  const supabase = getSupabaseClient()
  const { error } = await supabase
    .from('patient_presence')
    .update({
      is_online: false,
      current_session_type: null,
      updated_at: new Date().toISOString(),
    })
    .eq('patient_id', patientId)

  if (error) {
    if (isMissingRelationError(error, 'patient_presence')) {
      return
    }

    throw error
  }
}