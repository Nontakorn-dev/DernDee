import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const profileBucket = import.meta.env.VITE_SUPABASE_PROFILE_BUCKET || 'profile-images'
const authRedirectUrl = import.meta.env.VITE_SUPABASE_AUTH_REDIRECT_URL || null

let browserClient = null

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export function getSupabaseConfigError() {
  return 'Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
}

export function getProfileImageBucket() {
  return profileBucket
}

export function getAuthRedirectUrl(path = '/login') {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString()
  }

  if (authRedirectUrl) {
    return authRedirectUrl
  }

  return path
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    throw new Error(getSupabaseConfigError())
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
      },
    })
  }

  return browserClient
}