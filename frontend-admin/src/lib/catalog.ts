import { requestJson } from '#/lib/api.ts'

export interface CatalogOutlet {
  id: string
  code: string
  name: string
  tenant_id: string
  tenant_code: string
  tenant_name: string
}

export interface CatalogItem {
  product_id: string
  sku: string
  name: string
  description: string | null
  image_url: string | null
  category_id: string | null
  category_name: string | null
  price: number | null
}

export interface CatalogResponse {
  outlet: CatalogOutlet
  value: CatalogItem[]
}

export function getOutletCatalog(
  token: string,
  outletId: string,
): Promise<CatalogResponse> {
  return requestJson(`/catalog/outlets/${outletId}`, { token })
}
