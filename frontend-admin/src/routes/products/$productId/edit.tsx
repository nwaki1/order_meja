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
import { getProduct, updateProduct } from '#/lib/products.ts'
import type { Product } from '#/lib/products.ts'

export const Route = createFileRoute('/products/$productId/edit')({
  component: ProductEditPage,
})

function ProductEditPage() {
  const { productId } = Route.useParams()
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [product, setProduct] = React.useState<Product | null>(null)
  const [categories, setCategories] = React.useState<ProductCategory[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    Promise.all([
      getProduct(accessToken, productId),
      listProductCategories(accessToken, {
        $top: 200,
        $skip: 0,
        $orderby: 'name asc',
      }),
    ])
      .then(([productData, categoriesRes]) => {
        if (!cancelled) {
          setProduct(productData)
          setCategories(categoriesRes.value ?? [])
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Gagal memuat data')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, productId])

  async function handleSubmit(data: ProductFormData) {
    if (!accessToken || !product) return
    setFormError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const updated = await updateProduct(accessToken, product.id, {
        category_id: data.category_id || undefined,
        sku: data.sku.trim(),
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        image_url: data.image_url.trim() || undefined,
        unit: data.unit.trim() || undefined,
        is_stock_tracked: data.is_stock_tracked,
        is_active: data.is_active,
      })
      router.navigate({
        to: '/products/$productId',
        params: { productId: updated.id },
      })
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message)
        setFieldErrors(e.fieldErrors ?? {})
      } else {
        setFormError(e instanceof Error ? e.message : 'Terjadi kesalahan')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/products/$productId" params={{ productId }}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loadError || !product) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/products/$productId" params={{ productId }}>
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Produk tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/products/$productId" params={{ productId: product.id }}>
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Edit Produk
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <ProductForm
          mode="edit"
          initialData={product}
          categories={categories}
          error={formError}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() =>
            router.navigate({
              to: '/products/$productId',
              params: { productId: product.id },
            })
          }
        />
      </div>
    </div>
  )
}
