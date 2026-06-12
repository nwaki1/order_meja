import { ApiError, requestJson } from '#/lib/api.ts'
import {
  normalizeThemeMode,
  type ThemeMode,
} from '#/lib/theme.ts'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
  themeMode: ThemeMode
  permissions: string[]
}

type ApiUserInfo = {
  id: string
  email: string
  name: string
  role: string
  theme_mode: unknown
  permissions?: unknown
}

export type LoginResponse = {
  token_type: 'Bearer'
  access_token: string
  expires_at: string
  user: ApiUserInfo
}

export type StoredAuthSession = {
  accessToken: string
  expiresAt: string
  user: AuthUser
}

export const AUTH_STORAGE_KEY = 'sportiva_session'
const LEGACY_AUTH_STORAGE_KEY = 'sportiva_admin_session'

function mapApiUser(user: ApiUserInfo): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    themeMode: normalizeThemeMode(user.theme_mode, 'auto'),
    permissions: Array.isArray(user.permissions)
      ? user.permissions.filter((permission): permission is string => {
          return typeof permission === 'string'
        })
      : [],
  }
}

export function readStoredSession(): StoredAuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw =
    window.localStorage.getItem(AUTH_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as {
      accessToken?: unknown
      expiresAt?: unknown
      user?: {
        id?: unknown
        email?: unknown
        name?: unknown
        role?: unknown
        themeMode?: unknown
        theme_mode?: unknown
        permissions?: unknown
      }
    }

    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.expiresAt === 'string' &&
      parsed.user &&
      typeof parsed.user.id === 'string' &&
      typeof parsed.user.email === 'string' &&
      typeof parsed.user.name === 'string' &&
      typeof parsed.user.role === 'string'
    ) {
      return {
        accessToken: parsed.accessToken,
        expiresAt: parsed.expiresAt,
        user: {
          id: parsed.user.id,
          email: parsed.user.email,
          name: parsed.user.name,
          role: parsed.user.role,
          themeMode: normalizeThemeMode(
            parsed.user.themeMode ?? parsed.user.theme_mode,
            'auto',
          ),
          permissions: Array.isArray(parsed.user.permissions)
            ? parsed.user.permissions.filter(
                (permission): permission is string =>
                  typeof permission === 'string',
              )
            : [],
        },
      }
    }
  } catch {
    return null
  }

  return null
}

export function writeStoredSession(session: StoredAuthSession) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
}

export function clearStoredSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY)
}

export async function loginUser(email: string, password: string) {
  const response = await requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })

  const user = mapApiUser(response.user)

  return {
    accessToken: response.access_token,
    expiresAt: response.expires_at,
    user,
  } satisfies StoredAuthSession
}

export async function fetchCurrentUser(accessToken: string) {
  const user = await requestJson<ApiUserInfo>('/auth/me', {
    method: 'GET',
    token: accessToken,
  })

  return mapApiUser(user)
}

export async function logoutUser(accessToken: string) {
  await requestJson<void>('/auth/logout', {
    method: 'POST',
    token: accessToken,
  })
}

export async function updateThemeMode(
  accessToken: string,
  themeMode: ThemeMode,
) {
  const user = await requestJson<ApiUserInfo>('/auth/me/settings', {
    method: 'PATCH',
    token: accessToken,
    body: { theme_mode: themeMode },
  })

  return mapApiUser(user)
}
