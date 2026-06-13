import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface ShiftTarget {
  id: string
  shift_id: string
  target_type: string
  target_value: number
  bonus_amount: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ShiftTargetResult {
  id: string
  shift_target_id: string
  target_type: string
  target_value: number
  bonus_amount: number
  actual_value: number
  achievement_percentage: number
  is_achieved: boolean
  calculated_at: string
  created_at: string
}

export interface WorkerIncentive {
  id: string
  worker_id: string
  worker_code: string
  worker_name: string
  shift_id: string
  shift_name: string
  work_date: string
  outlet_id: string
  outlet_name: string
  shift_target_id: string
  target_type: string
  target_value: number
  amount: number
  created_at: string
}

export interface CreateShiftTargetPayload {
  target_type: string
  target_value: number
  bonus_amount: number
}

export interface UpdateShiftTargetPayload {
  target_value?: number
  bonus_amount?: number
  is_active?: boolean
}

export interface WorkerIncentiveListParams {
  $top?: number
  $skip?: number
  $count?: boolean
  date_from?: string
  date_to?: string
}

export function listShiftTargets(
  token: string,
  shiftId: string,
): Promise<{ value: ShiftTarget[] }> {
  return requestJson(`/shifts/${shiftId}/targets`, { token })
}

export function createShiftTarget(
  token: string,
  shiftId: string,
  payload: CreateShiftTargetPayload,
): Promise<ShiftTarget> {
  return requestJson(`/shifts/${shiftId}/targets`, {
    method: 'POST',
    body: payload,
    token,
  })
}

export function updateShiftTarget(
  token: string,
  id: string,
  payload: UpdateShiftTargetPayload,
): Promise<ShiftTarget> {
  return requestJson(`/shift-targets/${id}`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function deactivateShiftTarget(
  token: string,
  id: string,
): Promise<void> {
  return requestJson(`/shift-targets/${id}`, { method: 'DELETE', token })
}

export function listShiftTargetResults(
  token: string,
  shiftId: string,
): Promise<{ value: ShiftTargetResult[] }> {
  return requestJson(`/shifts/${shiftId}/target-results`, { token })
}

export function listShiftIncentives(
  token: string,
  shiftId: string,
): Promise<{ value: WorkerIncentive[] }> {
  return requestJson(`/shifts/${shiftId}/incentives`, { token })
}

export function listWorkerIncentives(
  token: string,
  workerId: string,
  params?: WorkerIncentiveListParams,
): Promise<ODataResponse<WorkerIncentive>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$count) q.set('$count', 'true')
  if (params?.date_from) q.set('date_from', params.date_from)
  if (params?.date_to) q.set('date_to', params.date_to)
  const qs = q.toString()
  return requestJson(`/workers/${workerId}/incentives${qs ? `?${qs}` : ''}`, {
    token,
  })
}
