import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { getOutletCatalog } from '#/lib/catalog.ts'
import type { CatalogItem, CatalogOutlet } from '#/lib/catalog.ts'

export const Route = createFileRoute('/outlets/$outletId/catalog')({
  component: OutletCatalogPage,
})

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function OutletCatalogPage() {
  const { outletId } = Route.useParams()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [outlet, setOutlet] = React.useState<CatalogOutlet | null>(null)
  const [items, setItems] = React.useState<CatalogItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    getOutletCatalog(accessToken, outletId)
      .then((data) => {
        if (!cancelled) {
          setOutlet(data.outlet)
          setItems(data.value ?? [])
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Gagal memuat katalog')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, outletId])

  const filteredItems = items.filter((item) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return (
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      (item.category_name ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/outlets/$outletId" params={{ outletId }}>
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Katalog Outlet
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      {outlet && (
        <div className="rounded-lg border border-[var(--line)] bg-background p-4">
          <p className="text-sm font-semibold text-[var(--sea-ink)]">
            {outlet.name}{' '}
            <span className="text-xs font-normal text-[var(--sea-ink-soft)]">
              ({outlet.code})
            </span>
          </p>
          <p className="text-xs text-[var(--sea-ink-soft)]">
            Tenant: {outlet.tenant_name} ({outlet.tenant_code})
          </p>
        </div>
      )}

      <div className="max-w-xs">
        <Input
          placeholder="Cari produk / SKU / kategori..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--line)] bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                SKU
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Produk
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Kategori
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Harga
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {loadError ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-destructive"
                >
                  {loadError}
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat katalog...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Tidak ada produk pada katalog ini.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.product_id}
                  className="bg-background transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-semibold text-[var(--sea-ink)]">
                    {item.sku}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink)]">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {item.category_name ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    {item.price == null ? (
                      <span className="text-xs text-[var(--sea-ink-soft)]">
                        Belum ada harga
                      </span>
                    ) : (
                      <span className="font-medium text-[var(--sea-ink)]">
                        {formatIDR(item.price)}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
