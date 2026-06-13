import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface Product {
  id: string
  tenant_id: string
  tenant_code: string
  tenant_name: string
  category_id: string | null
  category_name: string | null
  sku: string
  name: string
  description: string | null
  image_url: string | null
  unit: string
  is_stock_tracked: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateProductPayload {
  tenant_id: string
  category_id?: string
  sku: string
  name: string
  description?: string
  image_url?: string
  unit?: string
  is_stock_tracked?: boolean
}

export interface UpdateProductPayload {
  category_id?: string
  sku?: string
  name?: string
  description?: string
  image_url?: string
  unit?: string
  is_stock_tracked?: boolean
  is_active?: boolean
}

export interface ProductListParams {
  $top?: number
  $skip?: number
  $orderby?: string
  $count?: boolean
  tenant_id?: string
  category_id?: string
  search?: string
  is_active?: boolean
}

export function listProducts(
  token: string,
  params?: ProductListParams,
): Promise<ODataResponse<Product>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$count) q.set('$count', 'true')
  if (params?.tenant_id) q.set('tenant_id', params.tenant_id)
  if (params?.category_id) q.set('category_id', params.category_id)
  if (params?.search) q.set('search', params.search)
  if (params?.is_active != null) q.set('is_active', String(params.is_active))
  const qs = q.toString()
  return requestJson(`/products${qs ? `?${qs}` : ''}`, { token })
}

export function getProduct(token: string, id: string): Promise<Product> {
  return requestJson(`/products/${id}`, { token })
}

export function createProduct(
  token: string,
  payload: CreateProductPayload,
): Promise<Product> {
  return requestJson('/products', { method: 'POST', body: payload, token })
}

export function updateProduct(
  token: string,
  id: string,
  payload: UpdateProductPayload,
): Promise<Product> {
  return requestJson(`/products/${id}`, { method: 'PUT', body: payload, token })
}

export function deactivateProduct(token: string, id: string): Promise<void> {
  return requestJson(`/products/${id}`, { method: 'DELETE', token })
}
