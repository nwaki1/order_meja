import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface SalarySetting {
  worker_id: string
  base_salary: number
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

export interface PayrollPeriod {
  id: string
  tenant_id: string
  tenant_code: string
  tenant_name: string
  year: number
  month: number
  status: string
  finalized_at: string | null
  finalized_by_user_id: string | null
  worker_count: number
  total_payroll: number
  created_at: string
  updated_at: string
}

export interface Payroll {
  id: string
  payroll_period_id: string
  year: number
  month: number
  tenant_id: string
  worker_id: string
  worker_code: string
  worker_name: string
  base_salary: number
  incentive_total: number
  adjustment_total: number
  deduction_total: number
  grand_total: number
  status: string
  calculated_at: string | null
  finalized_at: string | null
  created_at: string
  updated_at: string
}

export interface PayrollItem {
  id: string
  payroll_id: string
  item_type: string
  source_type: string
  source_id: string | null
  description: string
  amount: number
  created_at: string
}

export interface PayrollPeriodDetail extends PayrollPeriod {
  payrolls: Payroll[]
}

export interface PayrollDetail extends Payroll {
  items: PayrollItem[]
}

export interface UpdateSalarySettingPayload {
  base_salary: number
  is_active?: boolean
}

export interface CreatePayrollPeriodPayload {
  tenant_id: string
  year: number
  month: number
}

export interface AddPayrollItemPayload {
  item_type: 'adjustment' | 'deduction'
  description: string
  amount: number
}

export interface PayrollPeriodListParams {
  $top?: number
  $skip?: number
  $count?: boolean
  tenant_id?: string
  year?: number
  month?: number
  status?: string
}

export interface WorkerPayrollListParams {
  $top?: number
  $skip?: number
  $count?: boolean
  year?: number
  status?: string
}

// ---- Salary settings (worker-scoped) ----

export function getSalarySetting(
  token: string,
  workerId: string,
): Promise<SalarySetting> {
  return requestJson(`/workers/${workerId}/salary-setting`, { token })
}

export function updateSalarySetting(
  token: string,
  workerId: string,
  payload: UpdateSalarySettingPayload,
): Promise<SalarySetting> {
  return requestJson(`/workers/${workerId}/salary-setting`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function listWorkerPayrolls(
  token: string,
  workerId: string,
  params?: WorkerPayrollListParams,
): Promise<ODataResponse<Payroll>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$count) q.set('$count', 'true')
  if (params?.year != null) q.set('year', String(params.year))
  if (params?.status) q.set('status', params.status)
  const qs = q.toString()
  return requestJson(`/workers/${workerId}/payrolls${qs ? `?${qs}` : ''}`, {
    token,
  })
}

// ---- Payroll periods ----

export function listPayrollPeriods(
  token: string,
  params?: PayrollPeriodListParams,
): Promise<ODataResponse<PayrollPeriod>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$count) q.set('$count', 'true')
  if (params?.tenant_id) q.set('tenant_id', params.tenant_id)
  if (params?.year != null) q.set('year', String(params.year))
  if (params?.month != null) q.set('month', String(params.month))
  if (params?.status) q.set('status', params.status)
  const qs = q.toString()
  return requestJson(`/payroll-periods${qs ? `?${qs}` : ''}`, { token })
}

export function getPayrollPeriod(
  token: string,
  id: string,
): Promise<PayrollPeriodDetail> {
  return requestJson(`/payroll-periods/${id}`, { token })
}

export function createPayrollPeriod(
  token: string,
  payload: CreatePayrollPeriodPayload,
): Promise<PayrollPeriod> {
  return requestJson('/payroll-periods', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function calculatePayrollPeriod(
  token: string,
  id: string,
): Promise<PayrollPeriodDetail> {
  return requestJson(`/payroll-periods/${id}/calculate`, {
    method: 'POST',
    token,
  })
}

export function finalizePayrollPeriod(
  token: string,
  id: string,
): Promise<PayrollPeriod> {
  return requestJson(`/payroll-periods/${id}/finalize`, {
    method: 'POST',
    token,
  })
}

export function cancelPayrollPeriod(
  token: string,
  id: string,
): Promise<PayrollPeriod> {
  return requestJson(`/payroll-periods/${id}/cancel`, {
    method: 'POST',
    token,
  })
}

// ---- Payroll detail + manual items ----

export function getPayroll(token: string, id: string): Promise<PayrollDetail> {
  return requestJson(`/payrolls/${id}`, { token })
}

export function addPayrollItem(
  token: string,
  payrollId: string,
  payload: AddPayrollItemPayload,
): Promise<PayrollDetail> {
  return requestJson(`/payrolls/${payrollId}/items`, {
    method: 'POST',
    body: payload,
    token,
  })
}

export function deletePayrollItem(
  token: string,
  payrollId: string,
  itemId: string,
): Promise<void> {
  return requestJson(`/payrolls/${payrollId}/items/${itemId}`, {
    method: 'DELETE',
    token,
  })
}
