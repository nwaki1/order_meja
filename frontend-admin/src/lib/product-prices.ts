import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface ProductPrice {
  id: string
  product_id: string
  product_sku: string
  product_name: string
  outlet_id: string
  outlet_code: string
  outlet_name: string
  price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateProductPricePayload {
  product_id: string
  outlet_id: string
  price: number
}

export interface UpdateProductPricePayload {
  price?: number
  is_active?: boolean
}

export interface ProductPriceListParams {
  $top?: number
  $skip?: number
  $orderby?: string
  $count?: boolean
  product_id?: string
  outlet_id?: string
  is_active?: boolean
}

export function listProductPrices(
  token: string,
  params?: ProductPriceListParams,
): Promise<ODataResponse<ProductPrice>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$count) q.set('$count', 'true')
  if (params?.product_id) q.set('product_id', params.product_id)
  if (params?.outlet_id) q.set('outlet_id', params.outlet_id)
  if (params?.is_active != null) q.set('is_active', String(params.is_active))
  const qs = q.toString()
  return requestJson(`/product-prices${qs ? `?${qs}` : ''}`, { token })
}

export function createProductPrice(
  token: string,
  payload: CreateProductPricePayload,
): Promise<ProductPrice> {
  return requestJson('/product-prices', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function updateProductPrice(
  token: string,
  id: string,
  payload: UpdateProductPricePayload,
): Promise<ProductPrice> {
  return requestJson(`/product-prices/${id}`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function deactivateProductPrice(
  token: string,
  id: string,
): Promise<void> {
  return requestJson(`/product-prices/${id}`, { method: 'DELETE', token })
}
