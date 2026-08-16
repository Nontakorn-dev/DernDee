export const DEFAULT_USER_PREFERENCES = {
  theme: 'light',
  language: 'th',
  notifications: true,
  dailyStepGoal: 500,
  dataSharing: true,
  analytics: true,
}

const THEME_STORAGE_KEY = 'derndee.theme'

export function normalizeUserPreferences(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const dailyStepGoal = Number(source.dailyStepGoal)
  const language = source.language === 'en' ? 'en' : 'th'

  return {
    theme: source.theme === 'dark' ? 'dark' : 'light',
    language,
    notifications: source.notifications !== false,
    dailyStepGoal: Number.isFinite(dailyStepGoal) && dailyStepGoal > 0 ? Math.round(dailyStepGoal) : 500,
    dataSharing: source.dataSharing !== false,
    analytics: source.analytics !== false,
  }
}

export function getDateLocale(language) {
  return language === 'en' ? 'en-US' : 'th-TH'
}

export function formatAppDate(value, language = 'th', options = {}) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date
    ? value
    : value?.toDate
      ? value.toDate()
      : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleDateString(getDateLocale(language), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  })
}

export function applyUserPreferences(rawPreferences) {
  const preferences = normalizeUserPreferences(rawPreferences)

  if (typeof document === 'undefined') {
    return preferences
  }

  document.documentElement.classList.toggle('dark', preferences.theme === 'dark')
  document.documentElement.lang = preferences.language

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preferences.theme)
  } catch {
    // Ignore private-mode storage failures.
  }

  return preferences
}

export function restoreStoredTheme() {
  if (typeof document === 'undefined') {
    return
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    document.documentElement.classList.toggle('dark', storedTheme === 'dark')
  } catch {
    // Ignore private-mode storage failures.
  }
}

restoreStoredTheme()
