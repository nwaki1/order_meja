import { requestJson } from '#/lib/api.ts'

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  created_at: string
  updated_at: string
}

export interface CreateUserPayload {
  email: string
  name: string
  password: string
  role: string
}

export interface UpdateUserPayload {
  email?: string
  name?: string
  role?: string
  password?: string
}

// OData subset: $top, $skip, $orderby, $filter (contains / eq), $count
export interface ODataParams {
  $top?: number
  $skip?: number
  $orderby?: string
  $filter?: string
  $count?: boolean
}

export interface ODataResponse<T> {
  '@odata.count'?: number
  value: T[]
}

export function listUsers(
  token: string,
  params?: ODataParams,
): Promise<ODataResponse<User>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$filter) q.set('$filter', params.$filter)
  if (params?.$count) q.set('$count', 'true')
  const qs = q.toString()
  return requestJson(`/users${qs ? `?${qs}` : ''}`, { token })
}

export function getUser(token: string, id: string): Promise<User> {
  return requestJson(`/users/${id}`, { token })
}

export function createUser(token: string, payload: CreateUserPayload): Promise<User> {
  return requestJson('/users', { method: 'POST', body: payload, token })
}

export function updateUser(
  token: string,
  id: string,
  payload: UpdateUserPayload,
): Promise<User> {
  return requestJson(`/users/${id}`, { method: 'PUT', body: payload, token })
}

export function deleteUser(token: string, id: string): Promise<void> {
  return requestJson(`/users/${id}`, { method: 'DELETE', token })
}
