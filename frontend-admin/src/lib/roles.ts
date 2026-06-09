import { requestJson } from '#/lib/api.ts'
import type { ODataParams, ODataResponse } from '#/lib/users.ts'

export interface Role {
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface CreateRolePayload {
  name: string
  description: string
}

export interface UpdateRolePayload {
  name?: string
  description?: string
}

export function listRoles(
  token: string,
  params?: ODataParams,
): Promise<ODataResponse<Role>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$filter) q.set('$filter', params.$filter)
  if (params?.$count) q.set('$count', 'true')
  const qs = q.toString()
  return requestJson(`/roles${qs ? `?${qs}` : ''}`, { token })
}

export function getRole(token: string, name: string): Promise<Role> {
  return requestJson(`/roles/${encodeURIComponent(name)}`, { token })
}

export function createRole(token: string, payload: CreateRolePayload): Promise<Role> {
  return requestJson('/roles', { method: 'POST', body: payload, token })
}

export function updateRole(
  token: string,
  name: string,
  payload: UpdateRolePayload,
): Promise<Role> {
  return requestJson(`/roles/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function deleteRole(token: string, name: string): Promise<void> {
  return requestJson(`/roles/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    token,
  })
}
