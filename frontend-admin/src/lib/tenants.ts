import { requestJson } from '#/lib/api.ts'
import type { ODataParams, ODataResponse } from '#/lib/users.ts'

export interface Tenant {
  id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TenantUser {
  tenant_id: string
  user_id: string
  email: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TenantUsersResponse {
  value: TenantUser[]
}

export interface CreateTenantPayload {
  code: string
  name: string
}

export interface UpdateTenantPayload {
  code?: string
  name?: string
  is_active?: boolean
}

export function listTenants(
  token: string,
  params?: ODataParams,
): Promise<ODataResponse<Tenant>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$filter) q.set('$filter', params.$filter)
  if (params?.$count) q.set('$count', 'true')
  const qs = q.toString()
  return requestJson(`/tenants${qs ? `?${qs}` : ''}`, { token })
}

export function getTenant(token: string, id: string): Promise<Tenant> {
  return requestJson(`/tenants/${id}`, { token })
}

export function createTenant(
  token: string,
  payload: CreateTenantPayload,
): Promise<Tenant> {
  return requestJson('/tenants', { method: 'POST', body: payload, token })
}

export function updateTenant(
  token: string,
  id: string,
  payload: UpdateTenantPayload,
): Promise<Tenant> {
  return requestJson(`/tenants/${id}`, { method: 'PUT', body: payload, token })
}

export function deleteTenant(token: string, id: string): Promise<void> {
  return requestJson(`/tenants/${id}`, { method: 'DELETE', token })
}

export function listTenantUsers(
  token: string,
  id: string,
): Promise<TenantUsersResponse> {
  return requestJson(`/tenants/${id}/users`, { token })
}

export function assignTenantUser(
  token: string,
  id: string,
  userId: string,
): Promise<TenantUser> {
  return requestJson(`/tenants/${id}/users`, {
    method: 'POST',
    body: { user_id: userId },
    token,
  })
}

export function revokeTenantUser(
  token: string,
  id: string,
  userId: string,
): Promise<void> {
  return requestJson(`/tenants/${id}/users/${userId}`, {
    method: 'DELETE',
    token,
  })
}
