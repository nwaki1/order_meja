import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface Worker {
  id: string
  tenant_id: string
  tenant_code: string
  tenant_name: string
  user_id: string | null
  user_email: string | null
  code: string
  name: string
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface WorkerOutlet {
  worker_id: string
  outlet_id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateWorkerPayload {
  tenant_id: string
  user_id?: string
  code: string
  name: string
  phone?: string
  email?: string
}

export interface UpdateWorkerPayload {
  user_id?: string
  code?: string
  name?: string
  phone?: string
  email?: string
  is_active?: boolean
}

export interface WorkerListParams {
  $top?: number
  $skip?: number
  $count?: boolean
  tenant_id?: string
  search?: string
  is_active?: boolean
}

export function listWorkers(
  token: string,
  params?: WorkerListParams,
): Promise<ODataResponse<Worker>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$count) q.set('$count', 'true')
  if (params?.tenant_id) q.set('tenant_id', params.tenant_id)
  if (params?.search) q.set('search', params.search)
  if (params?.is_active != null) q.set('is_active', String(params.is_active))
  const qs = q.toString()
  return requestJson(`/workers${qs ? `?${qs}` : ''}`, { token })
}

export function getWorker(token: string, id: string): Promise<Worker> {
  return requestJson(`/workers/${id}`, { token })
}

export function createWorker(
  token: string,
  payload: CreateWorkerPayload,
): Promise<Worker> {
  return requestJson('/workers', { method: 'POST', body: payload, token })
}

export function updateWorker(
  token: string,
  id: string,
  payload: UpdateWorkerPayload,
): Promise<Worker> {
  return requestJson(`/workers/${id}`, { method: 'PUT', body: payload, token })
}

export function deactivateWorker(token: string, id: string): Promise<void> {
  return requestJson(`/workers/${id}`, { method: 'DELETE', token })
}

export function listOutletWorkers(
  token: string,
  outletId: string,
): Promise<{ value: WorkerOutlet[] }> {
  return requestJson(`/outlets/${outletId}/workers`, { token })
}

export function assignOutletWorker(
  token: string,
  outletId: string,
  workerId: string,
): Promise<WorkerOutlet> {
  return requestJson(`/outlets/${outletId}/workers`, {
    method: 'POST',
    body: { worker_id: workerId },
    token,
  })
}

export function revokeOutletWorker(
  token: string,
  outletId: string,
  workerId: string,
): Promise<void> {
  return requestJson(`/outlets/${outletId}/workers/${workerId}`, {
    method: 'DELETE',
    token,
  })
}
