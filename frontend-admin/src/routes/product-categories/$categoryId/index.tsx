import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { ProductCategoryForm } from '#/components/product-category-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  deactivateProductCategory,
  getProductCategory,
} from '#/lib/product-categories.ts'
import type { ProductCategory } from '#/lib/product-categories.ts'

export const Route = createFileRoute('/product-categories/$categoryId/')({
  component: ProductCategoryDetailPage,
})

function ProductCategoryDetailPage() {
  const { categoryId } = Route.useParams()
  const router = useRouter()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken

  const canUpdate = hasPermission('product_categories:update')
  const canDelete = hasPermission('product_categories:delete')

  const [category, setCategory] = React.useState<ProductCategory | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

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

  async function handleDelete() {
    if (!accessToken || !category) return
    setDeleting(true)
    try {
      await deactivateProductCategory(accessToken, category.id)
      router.navigate({ to: '/product-categories' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan kategori')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/product-categories">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
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
          <Link to="/product-categories">
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/product-categories">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Kategori
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canUpdate && (
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/product-categories/$categoryId/edit"
                params={{ categoryId: category.id }}
              >
                <Pencil />
                Edit
              </Link>
            </Button>
          )}

          {canDelete &&
            category.is_active &&
            (confirmDelete ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Menonaktifkan...' : 'Ya, Nonaktifkan'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  <X />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Nonaktifkan
              </Button>
            ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <ProductCategoryForm mode="view" initialData={category} />
      </div>
    </div>
  )
}
