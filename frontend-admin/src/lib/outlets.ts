import { requestJson } from '#/lib/api.ts'
import type { ODataParams, ODataResponse } from '#/lib/users.ts'

export interface Outlet {
  id: string
  code: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  current_tenant_id: string
  current_tenant_code: string
  current_tenant_name: string
  created_at: string
  updated_at: string
}

export interface OutletOwnership {
  id: string
  outlet_id: string
  tenant_id: string
  tenant_code: string
  tenant_name: string
  valid_from: string
  valid_until: string | null
  created_at: string
  updated_at: string
}

export interface OutletUser {
  outlet_id: string
  user_id: string
  email: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateOutletPayload {
  tenant_id: string
  code: string
  name: string
  address?: string
  phone?: string
}

export interface UpdateOutletPayload {
  code?: string
  name?: string
  address?: string
  phone?: string
  is_active?: boolean
}

export function listOutlets(
  token: string,
  params?: ODataParams,
): Promise<ODataResponse<Outlet>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$filter) q.set('$filter', params.$filter)
  if (params?.$count) q.set('$count', 'true')
  const qs = q.toString()
  return requestJson(`/outlets${qs ? `?${qs}` : ''}`, { token })
}

export function getOutlet(token: string, id: string): Promise<Outlet> {
  return requestJson(`/outlets/${id}`, { token })
}

export function createOutlet(
  token: string,
  payload: CreateOutletPayload,
): Promise<Outlet> {
  return requestJson('/outlets', { method: 'POST', body: payload, token })
}

export function updateOutlet(
  token: string,
  id: string,
  payload: UpdateOutletPayload,
): Promise<Outlet> {
  return requestJson(`/outlets/${id}`, { method: 'PUT', body: payload, token })
}

export function deactivateOutlet(token: string, id: string): Promise<void> {
  return requestJson(`/outlets/${id}`, { method: 'DELETE', token })
}

export function listOutletOwnerships(
  token: string,
  id: string,
): Promise<{ value: OutletOwnership[] }> {
  return requestJson(`/outlets/${id}/ownerships`, { token })
}

export function transferOutlet(
  token: string,
  id: string,
  tenantId: string,
): Promise<OutletOwnership> {
  return requestJson(`/outlets/${id}/transfer`, {
    method: 'POST',
    body: { tenant_id: tenantId },
    token,
  })
}

export function listOutletUsers(
  token: string,
  id: string,
): Promise<{ value: OutletUser[] }> {
  return requestJson(`/outlets/${id}/users`, { token })
}

export function assignOutletUser(
  token: string,
  id: string,
  userId: string,
): Promise<OutletUser> {
  return requestJson(`/outlets/${id}/users`, {
    method: 'POST',
    body: { user_id: userId },
    token,
  })
}

export function revokeOutletUser(
  token: string,
  id: string,
  userId: string,
): Promise<void> {
  return requestJson(`/outlets/${id}/users/${userId}`, {
    method: 'DELETE',
    token,
  })
}
