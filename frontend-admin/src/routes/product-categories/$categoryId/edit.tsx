import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { ProductCategoryForm } from '#/components/product-category-form.tsx'
import type { ProductCategoryFormData } from '#/components/product-category-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { ApiError } from '#/lib/api.ts'
import type { ApiFieldErrors } from '#/lib/api.ts'
import {
  getProductCategory,
  updateProductCategory,
} from '#/lib/product-categories.ts'
import type { ProductCategory } from '#/lib/product-categories.ts'

export const Route = createFileRoute('/product-categories/$categoryId/edit')({
  component: ProductCategoryEditPage,
})

function ProductCategoryEditPage() {
  const { categoryId } = Route.useParams()
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [category, setCategory] = React.useState<ProductCategory | null>(null)
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

    getProductCategory(accessToken, categoryId)
      .then((data) => {
        if (!cancelled) setCategory(data)
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
  }, [accessToken, categoryId])

  async function handleSubmit(data: ProductCategoryFormData) {
    if (!accessToken || !category) return
    setFormError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const updated = await updateProductCategory(accessToken, category.id, {
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        is_active: data.is_active,
      })
      router.navigate({
        to: '/product-categories/$categoryId',
        params: { categoryId: updated.id },
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
            <Link to="/product-categories/$categoryId" params={{ categoryId }}>
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

  if (loadError || !category) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/product-categories/$categoryId" params={{ categoryId }}>
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Kategori tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link
            to="/product-categories/$categoryId"
            params={{ categoryId: category.id }}
          >
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Edit Kategori
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <ProductCategoryForm
          mode="edit"
          initialData={category}
          error={formError}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() =>
            router.navigate({
              to: '/product-categories/$categoryId',
              params: { categoryId: category.id },
            })
          }
        />
      </div>
    </div>
  )
}
