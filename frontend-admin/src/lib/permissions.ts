import { requestJson } from '#/lib/api.ts'
import type { ODataParams, ODataResponse } from '#/lib/users.ts'

export interface Permission {
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface CreatePermissionPayload {
  name: string
  description: string
}

export interface UpdatePermissionPayload {
  name?: string
  description?: string
}

export function listPermissions(
  token: string,
  params?: ODataParams,
): Promise<ODataResponse<Permission>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$filter) q.set('$filter', params.$filter)
  if (params?.$count) q.set('$count', 'true')
  const qs = q.toString()
  return requestJson(`/permissions${qs ? `?${qs}` : ''}`, { token })
}

export function getPermission(
  token: string,
  name: string,
): Promise<Permission> {
  return requestJson(`/permissions/${encodeURIComponent(name)}`, { token })
}

export function createPermission(
  token: string,
  payload: CreatePermissionPayload,
): Promise<Permission> {
  return requestJson('/permissions', { method: 'POST', body: payload, token })
}

export function updatePermission(
  token: string,
  name: string,
  payload: UpdatePermissionPayload,
): Promise<Permission> {
  return requestJson(`/permissions/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function deletePermission(token: string, name: string): Promise<void> {
  return requestJson(`/permissions/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    token,
  })
}
