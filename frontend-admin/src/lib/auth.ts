import { ApiError, requestJson } from '#/lib/api.ts'
import {
  normalizeThemeMode,
  type ThemeMode,
} from '#/lib/theme.ts'

export type AdminUser = {
  id: string
  email: string
  name: string
  role: string
  themeMode: ThemeMode
}

type ApiUserInfo = {
  id: string
  email: string
  name: string
  role: string
  theme_mode: unknown
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
  user: AdminUser
}

export const AUTH_STORAGE_KEY = 'sportiva_admin_session'

export function isAdminUser(user: AdminUser | null | undefined) {
  return user?.role === 'admin'
}

function mapApiUser(user: ApiUserInfo): AdminUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    themeMode: normalizeThemeMode(user.theme_mode, 'auto'),
  }
}

export function readStoredSession(): StoredAuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
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
}

export function clearStoredSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

export async function loginAdmin(email: string, password: string) {
  const response = await requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })

  const user = mapApiUser(response.user)

  if (!isAdminUser(user)) {
    throw new ApiError('Akun ini bukan admin.', 403)
  }

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

export async function logoutAdmin(accessToken: string) {
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
