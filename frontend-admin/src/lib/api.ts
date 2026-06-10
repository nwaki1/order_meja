export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/$/, '')

export type ApiFieldErrors = Partial<Record<string, string>>

export class ApiError extends Error {
  status: number
  fieldErrors?: ApiFieldErrors

  constructor(message: string, status: number, fieldErrors?: ApiFieldErrors) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

async function readErrorPayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as
        | { error?: string; message?: string; fields?: ApiFieldErrors }
        | undefined
      return {
        message: payload?.error ?? payload?.message ?? response.statusText,
        fieldErrors: payload?.fields,
      }
    } catch {
      return { message: response.statusText }
    }
  }

  try {
    const text = await response.text()
    return { message: text.trim() || response.statusText }
  } catch {
    return { message: response.statusText }
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | null
  token?: string
}

export async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const shouldStringifyJson =
    options.body &&
    typeof options.body === 'object' &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams) &&
    !(options.body instanceof Blob) &&
    !(options.body instanceof ArrayBuffer)

  if (shouldStringifyJson) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: shouldStringifyJson
      ? JSON.stringify(options.body)
      : options.body ?? undefined,
  })

  if (!response.ok) {
    const { message, fieldErrors } = await readErrorPayload(response)
    throw new ApiError(message, response.status, fieldErrors)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
