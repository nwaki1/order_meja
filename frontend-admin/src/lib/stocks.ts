import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface OutletStock {
  outlet_id: string
  product_id: string
  sku: string
  name: string
  category_name: string | null
  unit: string
  is_stock_tracked: boolean
  quantity: number
  updated_at: string | null
}

export interface StockMovement {
  id: string
  outlet_id: string
  product_id: string
  product_sku: string
  product_name: string
  movement_type: string
  quantity: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_by_user_id: string
  created_by_name: string | null
  created_at: string
}

export type AdjustMovementType =
  | 'initial_stock'
  | 'adjustment_in'
  | 'adjustment_out'

export interface AdjustStockPayload {
  movement_type: AdjustMovementType
  quantity: number
  notes?: string | null
}

export interface StockListParams {
  $top?: number
  $skip?: number
  $count?: boolean
  search?: string
  is_stock_tracked?: boolean
}

export function listOutletStocks(
  token: string,
  outletId: string,
  params?: StockListParams,
): Promise<ODataResponse<OutletStock>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$count) q.set('$count', 'true')
  if (params?.search) q.set('search', params.search)
  if (params?.is_stock_tracked != null)
    q.set('is_stock_tracked', String(params.is_stock_tracked))
  const qs = q.toString()
  return requestJson(`/outlets/${outletId}/stocks${qs ? `?${qs}` : ''}`, {
    token,
  })
}

export function getOutletStock(
  token: string,
  outletId: string,
  productId: string,
): Promise<OutletStock> {
  return requestJson(`/outlets/${outletId}/stocks/${productId}`, { token })
}

export function listStockMovements(
  token: string,
  outletId: string,
  params?: {
    $top?: number
    $skip?: number
    $count?: boolean
    product_id?: string
  },
): Promise<ODataResponse<StockMovement>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$count) q.set('$count', 'true')
  if (params?.product_id) q.set('product_id', params.product_id)
  const qs = q.toString()
  return requestJson(
    `/outlets/${outletId}/stock-movements${qs ? `?${qs}` : ''}`,
    { token },
  )
}

export function adjustOutletStock(
  token: string,
  outletId: string,
  productId: string,
  payload: AdjustStockPayload,
): Promise<OutletStock> {
  return requestJson(`/outlets/${outletId}/stocks/${productId}/adjust`, {
    method: 'POST',
    body: payload,
    token,
  })
}
