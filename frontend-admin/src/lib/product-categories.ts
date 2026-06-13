import { requestJson } from '#/lib/api.ts'
import type { ODataResponse } from '#/lib/users.ts'

export interface ProductCategory {
  id: string
  tenant_id: string
  tenant_code: string
  tenant_name: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CreateProductCategoryPayload {
  tenant_id: string
  name: string
  description?: string
}

export interface UpdateProductCategoryPayload {
  name?: string
  description?: string
  is_active?: boolean
}

// product-categories uses plain filters (tenant_id, search, is_active) plus
// the shared OData paging params ($top/$skip/$orderby/$count).
export interface ProductCategoryListParams {
  $top?: number
  $skip?: number
  $orderby?: string
  $count?: boolean
  tenant_id?: string
  search?: string
  is_active?: boolean
}

export function listProductCategories(
  token: string,
  params?: ProductCategoryListParams,
): Promise<ODataResponse<ProductCategory>> {
  const q = new URLSearchParams()
  if (params?.$top != null) q.set('$top', String(params.$top))
  if (params?.$skip != null) q.set('$skip', String(params.$skip))
  if (params?.$orderby) q.set('$orderby', params.$orderby)
  if (params?.$count) q.set('$count', 'true')
  if (params?.tenant_id) q.set('tenant_id', params.tenant_id)
  if (params?.search) q.set('search', params.search)
  if (params?.is_active != null) q.set('is_active', String(params.is_active))
  const qs = q.toString()
  return requestJson(`/product-categories${qs ? `?${qs}` : ''}`, { token })
}

export function getProductCategory(
  token: string,
  id: string,
): Promise<ProductCategory> {
  return requestJson(`/product-categories/${id}`, { token })
}

export function createProductCategory(
  token: string,
  payload: CreateProductCategoryPayload,
): Promise<ProductCategory> {
  return requestJson('/product-categories', {
    method: 'POST',
    body: payload,
    token,
  })
}

export function updateProductCategory(
  token: string,
  id: string,
  payload: UpdateProductCategoryPayload,
): Promise<ProductCategory> {
  return requestJson(`/product-categories/${id}`, {
    method: 'PUT',
    body: payload,
    token,
  })
}

export function deactivateProductCategory(
  token: string,
  id: string,
): Promise<void> {
  return requestJson(`/product-categories/${id}`, { method: 'DELETE', token })
}
