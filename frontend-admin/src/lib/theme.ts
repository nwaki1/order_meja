export type ThemeMode = 'light' | 'dark' | 'auto'

export const THEME_STORAGE_KEY = 'theme'
const AUTH_STORAGE_KEY = 'sportiva_session'
const LEGACY_AUTH_STORAGE_KEY = 'sportiva_admin_session'

const THEME_MODES = new Set<ThemeMode>(['light', 'dark', 'auto'])

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_MODES.has(value as ThemeMode)
}

export function normalizeThemeMode(
  value: unknown,
  fallback: ThemeMode = 'auto',
): ThemeMode {
  return isThemeMode(value) ? value : fallback
}

export function getResolvedThemeMode(
  mode: ThemeMode,
  prefersDark?: boolean,
) {
  const resolvedPrefersDark =
    typeof prefersDark === 'boolean'
      ? prefersDark
      : typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches

  return mode === 'auto' ? (resolvedPrefersDark ? 'dark' : 'light') : mode
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const resolved = getResolvedThemeMode(mode)
  const root = document.documentElement

  root.classList.remove('light', 'dark')
  root.classList.add(resolved)

  if (mode === 'auto') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }

  root.style.colorScheme = resolved
}

function readThemeModeFromStoredSession(): ThemeMode | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawSession =
    window.localStorage.getItem(AUTH_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY)
  if (!rawSession) {
    return null
  }

  try {
    const parsed = JSON.parse(rawSession) as {
      user?: {
        themeMode?: unknown
        theme_mode?: unknown
      }
    }

    return normalizeThemeMode(
      parsed?.user?.themeMode ?? parsed?.user?.theme_mode,
      'auto',
    )
  } catch {
    return null
  }
}

export function readPreferredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'auto'
  }

  const sessionTheme = readThemeModeFromStoredSession()
  if (sessionTheme) {
    return sessionTheme
  }

  return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY), 'auto')
}

export function writePreferredThemeMode(mode: ThemeMode) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, mode)
}
