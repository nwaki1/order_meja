import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus, Trash2, X } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { ProductForm } from '#/components/product-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { deactivateProduct, getProduct } from '#/lib/products.ts'
import type { Product } from '#/lib/products.ts'
import {
  createProductPrice,
  deactivateProductPrice,
  listProductPrices,
  updateProductPrice,
} from '#/lib/product-prices.ts'
import type { ProductPrice } from '#/lib/product-prices.ts'
import { listOutlets } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'

export const Route = createFileRoute('/products/$productId/')({
  component: ProductDetailPage,
})

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function ProductDetailPage() {
  const { productId } = Route.useParams()
  const router = useRouter()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken

  const canUpdate = hasPermission('products:update')
  const canDelete = hasPermission('products:delete')
  const canReadPrices = hasPermission('product_prices:read')
  const canCreatePrice =
    canReadPrices &&
    hasPermission('product_prices:create') &&
    hasPermission('outlets:read')
  const canUpdatePrice = hasPermission('product_prices:update')
  const canDeletePrice = hasPermission('product_prices:delete')

  const [product, setProduct] = React.useState<Product | null>(null)
  const [prices, setPrices] = React.useState<ProductPrice[]>([])
  const [outlets, setOutlets] = React.useState<Outlet[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [selectedOutletId, setSelectedOutletId] = React.useState('')
  const [newPrice, setNewPrice] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [priceError, setPriceError] = React.useState<string | null>(null)

  const [editPriceId, setEditPriceId] = React.useState<string | null>(null)
  const [editPriceValue, setEditPriceValue] = React.useState('')
  const [savingEdit, setSavingEdit] = React.useState(false)

  const [revokePriceId, setRevokePriceId] = React.useState<string | null>(null)
  const [revoking, setRevoking] = React.useState(false)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    Promise.all([
      getProduct(accessToken, productId),
      canReadPrices
        ? listProductPrices(accessToken, {
            product_id: productId,
            $top: 100,
            $skip: 0,
          })
        : Promise.resolve({ value: [] as ProductPrice[] }),
      canCreatePrice
        ? listOutlets(accessToken, {
            $top: 100,
            $skip: 0,
            $orderby: 'name asc',
          })
        : Promise.resolve({ value: [] as Outlet[] }),
    ])
      .then(([productData, pricesData, outletsData]) => {
        if (!cancelled) {
          setProduct(productData)
          setPrices(pricesData.value ?? [])
          setOutlets(
            Array.isArray(outletsData)
              ? outletsData
              : (outletsData.value ?? []),
          )
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
  }, [accessToken, productId, refreshKey, canReadPrices, canCreatePrice])

  async function handleDelete() {
    if (!accessToken || !product) return
    setDeleting(true)
    try {
      await deactivateProduct(accessToken, product.id)
      router.navigate({ to: '/products' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan produk')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleAddPrice() {
    if (!accessToken || !product || !selectedOutletId) return
    const parsed = Number(newPrice)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPriceError('Harga harus berupa angka >= 0')
      return
    }
    setAdding(true)
    setPriceError(null)
    try {
      await createProductPrice(accessToken, {
        product_id: product.id,
        outlet_id: selectedOutletId,
        price: Math.round(parsed),
      })
      setSelectedOutletId('')
      setNewPrice('')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setPriceError(e instanceof Error ? e.message : 'Gagal menambahkan harga')
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit(id: string) {
    if (!accessToken) return
    const parsed = Number(editPriceValue)
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert('Harga harus berupa angka >= 0')
      return
    }
    setSavingEdit(true)
    try {
      await updateProductPrice(accessToken, id, { price: Math.round(parsed) })
      setEditPriceId(null)
      setEditPriceValue('')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal memperbarui harga')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleRevokePrice(id: string) {
    if (!accessToken) return
    setRevoking(true)
    try {
      await deactivateProductPrice(accessToken, id)
      setRevokePriceId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan harga')
    } finally {
      setRevoking(false)
    }
  }

  const activePricedOutletIds = React.useMemo(
    () => new Set(prices.filter((p) => p.is_active).map((p) => p.outlet_id)),
    [prices],
  )

  // Only outlets owned by the product's tenant, still active, and not already
  // priced, can receive a new price.
  const availableOutlets = outlets.filter(
    (o) =>
      o.is_active &&
      o.current_tenant_id === product?.tenant_id &&
      !activePricedOutletIds.has(o.id),
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/products">
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

  if (loadError || !product) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/products">
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/products">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Produk
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
                to="/products/$productId/edit"
                params={{ productId: product.id }}
              >
                <Pencil />
                Edit
              </Link>
            </Button>
          )}

          {canDelete &&
            product.is_active &&
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
        <ProductForm mode="view" initialData={product} />
      </div>

      {canReadPrices && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
                Harga per Outlet
              </h3>
              <p className="text-xs text-[var(--sea-ink-soft)]">
                {prices.length} harga terdaftar untuk produk ini.
              </p>
            </div>
            {canCreatePrice && (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Select
                  value={selectedOutletId}
                  onValueChange={setSelectedOutletId}
                  disabled={adding || availableOutlets.length === 0}
                >
                  <SelectTrigger size="sm" className="w-56 max-w-full">
                    <SelectValue placeholder="Pilih outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOutlets.map((outlet) => (
                      <SelectItem key={outlet.id} value={outlet.id}>
                        {outlet.name} ({outlet.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  placeholder="Harga"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-32"
                  disabled={adding}
                />
                <Button
                  size="sm"
                  onClick={handleAddPrice}
                  disabled={!selectedOutletId || !newPrice || adding}
                >
                  <Plus />
                  Tambah Harga
                </Button>
              </div>
            )}
          </div>

          {priceError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {priceError}
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--line)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--line)] bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Outlet
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Harga
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Status
                  </th>
                  {(canUpdatePrice || canDeletePrice) && (
                    <th className="px-4 py-3" />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {prices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canUpdatePrice || canDeletePrice ? 4 : 3}
                      className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                    >
                      Belum ada harga.
                    </td>
                  </tr>
                ) : (
                  prices.map((price) => {
                    const isEditing = editPriceId === price.id
                    const isConfirming = revokePriceId === price.id

                    return (
                      <tr
                        key={price.id}
                        className="bg-background transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-[var(--sea-ink)]">
                            {price.outlet_name}
                          </span>{' '}
                          <span className="text-xs text-[var(--sea-ink-soft)]">
                            ({price.outlet_code})
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--sea-ink)]">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={0}
                              value={editPriceValue}
                              onChange={(e) =>
                                setEditPriceValue(e.target.value)
                              }
                              className="w-32"
                              disabled={savingEdit}
                            />
                          ) : (
                            formatIDR(price.price)
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              price.is_active
                                ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                                : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                            }
                          >
                            {price.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        {(canUpdatePrice || canDeletePrice) && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {isEditing ? (
                                <>
                                  <Button
                                    size="xs"
                                    onClick={() => handleSaveEdit(price.id)}
                                    disabled={savingEdit}
                                  >
                                    Simpan
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => {
                                      setEditPriceId(null)
                                      setEditPriceValue('')
                                    }}
                                    disabled={savingEdit}
                                  >
                                    Batal
                                  </Button>
                                </>
                              ) : isConfirming ? (
                                <>
                                  <span className="mr-1 text-xs text-destructive">
                                    Nonaktifkan?
                                  </span>
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    onClick={() => handleRevokePrice(price.id)}
                                    disabled={revoking}
                                  >
                                    Ya
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setRevokePriceId(null)}
                                    disabled={revoking}
                                  >
                                    Batal
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {canUpdatePrice && price.is_active && (
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      onClick={() => {
                                        setEditPriceId(price.id)
                                        setEditPriceValue(String(price.price))
                                      }}
                                    >
                                      Ubah
                                    </Button>
                                  )}
                                  {canDeletePrice && price.is_active && (
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => setRevokePriceId(price.id)}
                                    >
                                      Nonaktifkan
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
