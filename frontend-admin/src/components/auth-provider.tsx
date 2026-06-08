import * as React from 'react'

import {
  clearStoredSession,
  fetchCurrentUser,
  isAdminUser,
  loginAdmin,
  logoutAdmin,
  readStoredSession,
  updateThemeMode as updateThemeModeRequest,
  type AdminUser,
  type StoredAuthSession,
  writeStoredSession,
} from '#/lib/auth.ts'
import {
  applyThemeMode,
  normalizeThemeMode,
  readPreferredThemeMode,
  type ThemeMode,
  writePreferredThemeMode,
} from '#/lib/theme.ts'

type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

type AuthContextValue = {
  status: AuthStatus
  session: StoredAuthSession | null
  user: AdminUser | null
  themeMode: ThemeMode
  login: (email: string, password: string) => Promise<StoredAuthSession>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  setThemeMode: (themeMode: ThemeMode) => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading')
  const [session, setSession] = React.useState<StoredAuthSession | null>(null)
  const [themeMode, setThemeModeState] = React.useState<ThemeMode>(() =>
    readPreferredThemeMode(),
  )

  React.useEffect(() => {
    applyThemeMode(themeMode)
    writePreferredThemeMode(themeMode)

    if (themeMode !== 'auto' || typeof window === 'undefined') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeMode('auto')

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }

    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [themeMode])

  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const stored = readStoredSession()

      if (!stored?.accessToken) {
        if (!cancelled) {
          setSession(null)
          setStatus('anonymous')
        }
        return
      }

      try {
        const user = await fetchCurrentUser(stored.accessToken)
        if (!isAdminUser(user)) {
          throw new Error('Non-admin session')
        }

        const nextSession: StoredAuthSession = {
          ...stored,
          user,
        }

        if (!cancelled) {
          writeStoredSession(nextSession)
          setSession(nextSession)
          setThemeModeState(user.themeMode)
          setStatus('authenticated')
        }
      } catch {
        clearStoredSession()
        if (!cancelled) {
          setSession(null)
          setThemeModeState(readPreferredThemeMode())
          setStatus('anonymous')
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  const login = React.useCallback(async (email: string, password: string) => {
    try {
      const nextSession = await loginAdmin(email, password)
      writeStoredSession(nextSession)
      setSession(nextSession)
      setThemeModeState(nextSession.user.themeMode)
      setStatus('authenticated')
      return nextSession
    } catch (error) {
      setSession(null)
      setThemeModeState(readPreferredThemeMode())
      setStatus('anonymous')
      throw error
    }
  }, [])

  const refreshSession = React.useCallback(async () => {
    if (!session?.accessToken) {
      setStatus('anonymous')
      return
    }

    try {
      const user = await fetchCurrentUser(session.accessToken)
      if (!isAdminUser(user)) {
        throw new Error('Non-admin session')
      }

      const nextSession = { ...session, user }
      writeStoredSession(nextSession)
      setSession(nextSession)
      setThemeModeState(user.themeMode)
      setStatus('authenticated')
    } catch {
      clearStoredSession()
      setSession(null)
      setThemeModeState(readPreferredThemeMode())
      setStatus('anonymous')
    }
  }, [session])

  const setThemeMode = React.useCallback(async (themeModeNext: ThemeMode) => {
    const nextThemeMode = normalizeThemeMode(themeModeNext, 'auto')
    const previousThemeMode = themeMode
    const previousSession = session

    setThemeModeState(nextThemeMode)

    if (!previousSession?.accessToken) {
      writePreferredThemeMode(nextThemeMode)
      return
    }

    try {
      const user = await updateThemeModeRequest(
        previousSession.accessToken,
        nextThemeMode,
      )
      const nextSession = { ...previousSession, user }
      writeStoredSession(nextSession)
      setSession(nextSession)
      setThemeModeState(user.themeMode)
      setStatus('authenticated')
    } catch (error) {
      setThemeModeState(previousThemeMode)
      throw error
    }
  }, [session, themeMode])

  const logout = React.useCallback(async () => {
    const token = session?.accessToken

    if (token) {
      try {
        await logoutAdmin(token)
      } catch {
        // Best effort: even if the server token is already invalid, clear local state.
      }
    }

    clearStoredSession()
    setSession(null)
    setThemeModeState(readPreferredThemeMode())
    setStatus('anonymous')
  }, [session])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      themeMode,
      login,
      logout,
      refreshSession,
      setThemeMode,
    }),
    [status, session, themeMode, login, logout, refreshSession, setThemeMode],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = React.useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return context
}
