import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { ProductForm } from '#/components/product-form.tsx'
import type { ProductFormData } from '#/components/product-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { ApiError } from '#/lib/api.ts'
import type { ApiFieldErrors } from '#/lib/api.ts'
import { listProductCategories } from '#/lib/product-categories.ts'
import type { ProductCategory } from '#/lib/product-categories.ts'
import { createProduct } from '#/lib/products.ts'
import { listTenants } from '#/lib/tenants.ts'
import type { Tenant } from '#/lib/tenants.ts'

export const Route = createFileRoute('/products/new')({
  component: NewProductPage,
})

function NewProductPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [categories, setCategories] = React.useState<ProductCategory[]>([])

  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false

    Promise.all([
      listTenants(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' }),
      listProductCategories(accessToken, {
        $top: 200,
        $skip: 0,
        $orderby: 'name asc',
      }),
    ])
      .then(([tenantsRes, categoriesRes]) => {
        if (!cancelled) {
          setTenants(
            Array.isArray(tenantsRes) ? tenantsRes : (tenantsRes.value ?? []),
          )
          setCategories(categoriesRes.value ?? [])
        }
      })
      .catch(() => {
        // best-effort; selects will show empty
      })

    return () => {
      cancelled = true
    }
  }, [accessToken])

  async function handleSubmit(data: ProductFormData) {
    if (!accessToken) return
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const product = await createProduct(accessToken, {
        tenant_id: data.tenant_id,
        category_id: data.category_id || undefined,
        sku: data.sku.trim(),
        name: data.name.trim(),
        description: data.description.trim() || undefined,
      })
      router.navigate({
        to: '/products/$productId',
        params: { productId: product.id },
      })
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        setFieldErrors(e.fieldErrors ?? {})
      } else {
        setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/products">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Tambah Produk
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <ProductForm
          mode="create"
          tenants={tenants}
          categories={categories}
          error={error}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/products' })}
        />
      </div>
    </div>
  )
}
