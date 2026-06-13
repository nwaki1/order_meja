import { requestJson } from '#/lib/api.ts'

export interface DashboardSummary {
  today_transaction_count: number
  today_revenue: number
  month_transaction_count: number
  month_revenue: number
  active_outlet_count: number
  active_worker_count: number
  active_product_count: number
  open_shift_count: number
}

export interface SalesRow {
  label: string
  transaction_count: number
  gross_revenue: number
  total_discount: number
}

export interface ProductSalesRow {
  product_id: string
  sku: string
  name: string
  quantity_sold: number
  revenue: number
}

export interface StockRow {
  outlet_id: string
  outlet_name: string
  product_id: string
  sku: string
  name: string
  unit: string
  quantity: number
}

export interface ShiftPerfRow {
  shift_id: string
  outlet_name: string
  work_date: string
  name_snapshot: string
  status: string
  worker_count: number
  revenue: number
  target_value: number | null
  actual_value: number | null
  is_achieved: boolean | null
  incentive_total: number
}

export interface WorkerIncentiveRow {
  worker_id: string
  worker_code: string
  worker_name: string
  tenant_name: string
  incentive_count: number
  incentive_total: number
}

export interface PayrollSummaryRow {
  payroll_period_id: string
  tenant_name: string
  year: number
  month: number
  status: string
  worker_count: number
  total_base: number
  total_incentive: number
  total_adjustment: number
  total_deduction: number
  total_grand: number
}

interface ListResponse<T> {
  value: T[]
}

export interface ReportFilters {
  tenant_id?: string
  outlet_id?: string
  date_from?: string
  date_to?: string
  group_by?: string
  limit?: number
  only_low?: boolean
  threshold?: number
  status?: string
  year?: number
}

function buildQuery(filters?: ReportFilters): string {
  if (!filters) return ''
  const q = new URLSearchParams()
  if (filters.tenant_id) q.set('tenant_id', filters.tenant_id)
  if (filters.outlet_id) q.set('outlet_id', filters.outlet_id)
  if (filters.date_from) q.set('date_from', filters.date_from)
  if (filters.date_to) q.set('date_to', filters.date_to)
  if (filters.group_by) q.set('group_by', filters.group_by)
  if (filters.limit != null) q.set('limit', String(filters.limit))
  if (filters.only_low) q.set('only_low', 'true')
  if (filters.threshold != null) q.set('threshold', String(filters.threshold))
  if (filters.status) q.set('status', filters.status)
  if (filters.year != null) q.set('year', String(filters.year))
  const qs = q.toString()
  return qs ? `?${qs}` : ''
}

export function getDashboard(
  token: string,
  tenantId?: string,
): Promise<DashboardSummary> {
  const qs = tenantId ? `?tenant_id=${tenantId}` : ''
  return requestJson(`/reports/dashboard${qs}`, { token })
}

export function getSalesReport(
  token: string,
  filters?: ReportFilters,
): Promise<ListResponse<SalesRow>> {
  return requestJson(`/reports/sales${buildQuery(filters)}`, { token })
}

export function getProductSalesReport(
  token: string,
  filters?: ReportFilters,
): Promise<ListResponse<ProductSalesRow>> {
  return requestJson(`/reports/product-sales${buildQuery(filters)}`, { token })
}

export function getStockReport(
  token: string,
  filters?: ReportFilters,
): Promise<ListResponse<StockRow>> {
  return requestJson(`/reports/stock${buildQuery(filters)}`, { token })
}

export function getShiftPerformanceReport(
  token: string,
  filters?: ReportFilters,
): Promise<ListResponse<ShiftPerfRow>> {
  return requestJson(`/reports/shift-performance${buildQuery(filters)}`, {
    token,
  })
}

export function getWorkerIncentiveReport(
  token: string,
  filters?: ReportFilters,
): Promise<ListResponse<WorkerIncentiveRow>> {
  return requestJson(`/reports/worker-incentives${buildQuery(filters)}`, {
    token,
  })
}

export function getPayrollSummaryReport(
  token: string,
  filters?: ReportFilters,
): Promise<ListResponse<PayrollSummaryRow>> {
  return requestJson(`/reports/payroll-summary${buildQuery(filters)}`, {
    token,
  })
}

export function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}
