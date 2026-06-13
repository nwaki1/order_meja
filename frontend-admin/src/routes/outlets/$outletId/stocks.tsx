import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import { getOutlet } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
import {
  adjustOutletStock,
  listOutletStocks,
  listStockMovements,
} from '#/lib/stocks.ts'
import type {
  AdjustMovementType,
  OutletStock,
  StockMovement,
} from '#/lib/stocks.ts'

export const Route = createFileRoute('/outlets/$outletId/stocks')({
  component: OutletStocksPage,
})

const MOVEMENT_LABELS: Record<string, string> = {
  initial_stock: 'Stok Awal',
  adjustment_in: 'Penyesuaian Masuk',
  adjustment_out: 'Penyesuaian Keluar',
  sale: 'Penjualan',
}

function OutletStocksPage() {
  const { outletId } = Route.useParams()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canAdjust = hasPermission('stocks:adjust')

  const [outlet, setOutlet] = React.useState<Outlet | null>(null)
  const [stocks, setStocks] = React.useState<OutletStock[]>([])
  const [movements, setMovements] = React.useState<StockMovement[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [search, setSearch] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [trackedFilter, setTrackedFilter] = React.useState<string>('all')

  // adjustment drawer state
  const [adjustTarget, setAdjustTarget] = React.useState<OutletStock | null>(
    null,
  )
  const [movementType, setMovementType] =
    React.useState<AdjustMovementType>('initial_stock')
  const [quantity, setQuantity] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [adjustError, setAdjustError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setSearchQuery(search), 400)
    return () => clearTimeout(t)
  }, [search])

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    Promise.all([
      getOutlet(accessToken, outletId),
      listOutletStocks(accessToken, outletId, {
        $top: 100,
        $skip: 0,
        search: searchQuery.trim() || undefined,
        is_stock_tracked:
          trackedFilter === 'all' ? undefined : trackedFilter === 'tracked',
      }),
      listStockMovements(accessToken, outletId, { $top: 30, $skip: 0 }),
    ])
      .then(([outletData, stocksData, movementsData]) => {
        if (!cancelled) {
          setOutlet(outletData)
          setStocks(stocksData.value ?? [])
          setMovements(movementsData.value ?? [])
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
  }, [accessToken, outletId, searchQuery, trackedFilter, refreshKey])

  function openAdjust(stock: OutletStock) {
    setAdjustTarget(stock)
    setMovementType('initial_stock')
    setQuantity('')
    setNotes('')
    setAdjustError(null)
  }

  async function handleAdjust() {
    if (!accessToken || !adjustTarget) return
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      setAdjustError('Quantity harus berupa angka > 0')
      return
    }
    setSubmitting(true)
    setAdjustError(null)
    try {
      await adjustOutletStock(accessToken, outletId, adjustTarget.product_id, {
        movement_type: movementType,
        quantity: Math.round(qty),
        notes: notes.trim() || undefined,
      })
      setAdjustTarget(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setAdjustError(e instanceof Error ? e.message : 'Gagal menyesuaikan stok')
    } finally {
      setSubmitting(false)
    }
  }

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
            Stok Outlet
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
            Tenant: {outlet.current_tenant_name} ({outlet.current_tenant_code})
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Cari produk / SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={trackedFilter} onValueChange={setTrackedFilter}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua produk</SelectItem>
            <SelectItem value="tracked">Dilacak stok</SelectItem>
            <SelectItem value="untracked">Tanpa pelacakan</SelectItem>
          </SelectContent>
        </Select>
        {loading && (
          <span className="animate-pulse text-xs text-[var(--sea-ink-soft)]">
            Memuat...
          </span>
        )}
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
                Stok
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Pelacakan
              </th>
              {canAdjust && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {loadError ? (
              <tr>
                <td
                  colSpan={canAdjust ? 6 : 5}
                  className="px-4 py-10 text-center text-destructive"
                >
                  {loadError}
                </td>
              </tr>
            ) : loading && stocks.length === 0 ? (
              <tr>
                <td
                  colSpan={canAdjust ? 6 : 5}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat data...
                </td>
              </tr>
            ) : stocks.length === 0 ? (
              <tr>
                <td
                  colSpan={canAdjust ? 6 : 5}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Tidak ada produk.
                </td>
              </tr>
            ) : (
              stocks.map((stock) => (
                <tr
                  key={stock.product_id}
                  className="bg-background transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-semibold text-[var(--sea-ink)]">
                    {stock.sku}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink)]">
                    {stock.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {stock.category_name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink)]">
                    {stock.is_stock_tracked ? (
                      <span className="font-medium">
                        {stock.quantity} {stock.unit}
                      </span>
                    ) : (
                      <span className="text-[var(--sea-ink-soft)]">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        stock.is_stock_tracked
                          ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                          : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {stock.is_stock_tracked ? 'Dilacak' : 'Tidak'}
                    </span>
                  </td>
                  {canAdjust && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {stock.is_stock_tracked && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => openAdjust(stock)}
                          >
                            <SlidersHorizontal />
                            Adjust
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--line)] bg-background p-6">
        <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
          Riwayat Pergerakan Stok
        </h3>
        <div className="overflow-hidden rounded-lg border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--line)] bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Waktu
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Produk
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Tipe
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Qty
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Oleh
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {movements.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                  >
                    Belum ada pergerakan stok.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const outbound =
                    m.movement_type === 'adjustment_out' ||
                    m.movement_type === 'sale'
                  return (
                    <tr key={m.id} className="bg-background">
                      <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                        {new Date(m.created_at).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink)]">
                        {m.product_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                        {MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <span
                          className={
                            outbound ? 'text-destructive' : 'text-primary'
                          }
                        >
                          {outbound ? '-' : '+'}
                          {m.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                        {m.created_by_name ?? '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet
        open={adjustTarget != null}
        onOpenChange={(open) => {
          if (!open) setAdjustTarget(null)
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Penyesuaian Stok</SheetTitle>
            <SheetDescription>
              {adjustTarget
                ? `${adjustTarget.name} (${adjustTarget.sku}) — stok saat ini ${adjustTarget.quantity} ${adjustTarget.unit}`
                : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="adj-type">Tipe Pergerakan</Label>
              <Select
                value={movementType}
                onValueChange={(v) => setMovementType(v as AdjustMovementType)}
                disabled={submitting}
              >
                <SelectTrigger id="adj-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial_stock">Stok Awal</SelectItem>
                  <SelectItem value="adjustment_in">
                    Penyesuaian Masuk
                  </SelectItem>
                  <SelectItem value="adjustment_out">
                    Penyesuaian Keluar
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-qty">Quantity</Label>
              <Input
                id="adj-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-notes">Catatan</Label>
              <Textarea
                id="adj-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opsional"
                disabled={submitting}
              />
            </div>

            {adjustError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {adjustError}
              </p>
            )}
          </div>

          <SheetFooter>
            <Button onClick={handleAdjust} disabled={submitting || !quantity}>
              {submitting ? 'Menyimpan...' : 'Simpan Penyesuaian'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setAdjustTarget(null)}
              disabled={submitting}
            >
              Batal
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
