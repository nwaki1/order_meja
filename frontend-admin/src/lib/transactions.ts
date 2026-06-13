import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface Transaction {
  id: string
  outlet_id: string
  outlet_code: string
  outlet_name: string
  invoice_number: string
  cashier_user_id: string
  cashier_name: string | null
  subtotal: number
  discount_amount: number
  total_amount: number
  status: string
  shift_id: string | null
  shift_name: string | null
  shift_work_date: string | null
  transaction_at: string
  created_at: string
  updated_at: string
}

export interface TransactionShiftWorker {
  worker_id: string
  code: string
  name: string
}

export interface TransactionItem {
  id: string
  product_id: string
  product_name_snapshot: string
  sku_snapshot: string
  unit_snapshot: string
  unit_price: number
  quantity: number
  subtotal: number
}

export interface TransactionPayment {
  id: string
  payment_method: string
  amount: number
  reference_number: string | null
  created_at: string
}

export interface TransactionDetail extends Transaction {
  items: TransactionItem[]
  payments: TransactionPayment[]
  shift_workers: TransactionShiftWorker[]
}

export interface TransactionListParams {
  $top?: number
  $skip?: number
  $orderby?: string
  $count?: boolean
  outlet_id?: string
  search?: string
  status?: string
  date_from?: string
  date_to?: string
}

export function listTransactions(
  token: string,
  params?: TransactionListParams,
): Promise<ODataResponse<Transaction>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$count) q.set('$count', 'true')
  if (params?.outlet_id) q.set('outlet_id', params.outlet_id)
  if (params?.search) q.set('search', params.search)
  if (params?.status) q.set('status', params.status)
  if (params?.date_from) q.set('date_from', params.date_from)
  if (params?.date_to) q.set('date_to', params.date_to)
  const qs = q.toString()
  return requestJson(`/transactions${qs ? `?${qs}` : ''}`, { token })
}

export function getTransaction(
  token: string,
  id: string,
): Promise<TransactionDetail> {
  return requestJson(`/transactions/${id}`, { token })
}
