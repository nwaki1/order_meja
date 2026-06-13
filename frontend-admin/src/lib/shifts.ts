import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface ShiftTemplate {
  id: string
  outlet_id: string
  outlet_code: string
  outlet_name: string
  name: string
  start_time: string
  end_time: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Shift {
  id: string
  outlet_id: string
  outlet_code: string
  outlet_name: string
  shift_template_id: string | null
  work_date: string
  name_snapshot: string
  start_time_snapshot: string
  end_time_snapshot: string
  opened_at: string | null
  closed_at: string | null
  status: string
  created_by_user_id: string
  closed_by_user_id: string | null
  worker_count: number
  created_at: string
  updated_at: string
}

export interface ShiftWorker {
  shift_id: string
  worker_id: string
  code: string
  name: string
  created_at: string
}

// ---- Shift templates (outlet-scoped) ----

export interface CreateShiftTemplatePayload {
  name: string
  start_time: string
  end_time: string
}

export interface UpdateShiftTemplatePayload {
  name?: string
  start_time?: string
  end_time?: string
  is_active?: boolean
}

export function listOutletShiftTemplates(
  token: string,
  outletId: string,
): Promise<{ value: ShiftTemplate[] }> {
  return requestJson(`/outlets/${outletId}/shift-templates`, { token })
}

export function createShiftTemplate(
  token: string,
  outletId: string,
  payload: CreateShiftTemplatePayload,
): Promise<ShiftTemplate> {
  return requestJson(`/outlets/${outletId}/shift-templates`, {
    method: 'POST',
    body: payload,
    token,
  })
}

export function getShiftTemplate(
  token: string,
  id: string,
): Promise<ShiftTemplate> {
  return requestJson(`/shift-templates/${id}`, { token })
}

export function updateShiftTemplate(
  token: string,
  id: string,
  payload: UpdateShiftTemplatePayload,
): Promise<ShiftTemplate> {
  return requestJson(`/shift-templates/${id}`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function deactivateShiftTemplate(
  token: string,
  id: string,
): Promise<void> {
  return requestJson(`/shift-templates/${id}`, { method: 'DELETE', token })
}

// ---- Shifts ----

export interface CreateShiftPayload {
  outlet_id: string
  shift_template_id?: string
  work_date: string
  name?: string
  start_time?: string
  end_time?: string
  worker_ids?: string[]
}

export interface ShiftListParams {
  $top?: number
  $skip?: number
  $count?: boolean
  outlet_id?: string
  work_date?: string
  status?: string
}

export function listShifts(
  token: string,
  params?: ShiftListParams,
): Promise<ODataResponse<Shift>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$count) q.set('$count', 'true')
  if (params?.outlet_id) q.set('outlet_id', params.outlet_id)
  if (params?.work_date) q.set('work_date', params.work_date)
  if (params?.status) q.set('status', params.status)
  const qs = q.toString()
  return requestJson(`/shifts${qs ? `?${qs}` : ''}`, { token })
}

export function getShift(token: string, id: string): Promise<Shift> {
  return requestJson(`/shifts/${id}`, { token })
}

export function createShift(
  token: string,
  payload: CreateShiftPayload,
): Promise<Shift> {
  return requestJson('/shifts', { method: 'POST', body: payload, token })
}

export function openShift(token: string, id: string): Promise<Shift> {
  return requestJson(`/shifts/${id}/open`, { method: 'POST', token })
}

export function closeShift(token: string, id: string): Promise<Shift> {
  return requestJson(`/shifts/${id}/close`, { method: 'POST', token })
}

export function cancelShift(token: string, id: string): Promise<Shift> {
  return requestJson(`/shifts/${id}/cancel`, { method: 'POST', token })
}

export function listShiftWorkers(
  token: string,
  id: string,
): Promise<{ value: ShiftWorker[] }> {
  return requestJson(`/shifts/${id}/workers`, { token })
}

export function addShiftWorker(
  token: string,
  id: string,
  workerId: string,
): Promise<ShiftWorker> {
  return requestJson(`/shifts/${id}/workers`, {
    method: 'POST',
    body: { worker_id: workerId },
    token,
  })
}

export function removeShiftWorker(
  token: string,
  id: string,
  workerId: string,
): Promise<void> {
  return requestJson(`/shifts/${id}/workers/${workerId}`, {
    method: 'DELETE',
    token,
  })
}

export function listOutletOpenShifts(
  token: string,
  outletId: string,
): Promise<{ value: Shift[] }> {
  return requestJson(`/outlets/${outletId}/open-shifts`, { token })
}
