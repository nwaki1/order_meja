import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, Minus, Plus, Search, Trash2, X } from 'lucide-react'

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
import { getOutletCatalog } from '#/lib/catalog.ts'
import type { CatalogItem } from '#/lib/catalog.ts'
import { listOutlets } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
import { checkout, PAYMENT_METHODS } from '#/lib/pos.ts'
import type { PaymentMethod } from '#/lib/pos.ts'
import type { TransactionDetail } from '#/lib/transactions.ts'

export const Route = createFileRoute('/pos/')({
  component: PosPage,
})

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

interface CartLine {
  product_id: string
  name: string
  sku: string
  price: number
  quantity: number
}

interface PaymentRow {
  payment_method: PaymentMethod
  amount: string
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  card: 'Kartu',
}

function PosPage() {
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [outlets, setOutlets] = React.useState<Outlet[]>([])
  const [outletId, setOutletId] = React.useState('')

  const [catalog, setCatalog] = React.useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = React.useState(false)
  const [catalogError, setCatalogError] = React.useState<string | null>(null)

  const [search, setSearch] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState('all')

  const [cart, setCart] = React.useState<CartLine[]>([])
  const [discount, setDiscount] = React.useState('')
  const [payments, setPayments] = React.useState<PaymentRow[]>([
    { payment_method: 'cash', amount: '' },
  ])

  const [submitting, setSubmitting] = React.useState(false)
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<TransactionDetail | null>(null)

  React.useEffect(() => {
    if (!accessToken) return
    listOutlets(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setOutlets(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {
        // best-effort
      })
  }, [accessToken])

  React.useEffect(() => {
    if (!accessToken || !outletId) {
      setCatalog([])
      return
    }
    let cancelled = false
    setCatalogLoading(true)
    setCatalogError(null)
    getOutletCatalog(accessToken, outletId)
      .then((data) => {
        if (!cancelled) setCatalog(data.value ?? [])
      })
      .catch((e) => {
        if (!cancelled) {
          setCatalogError(
            e instanceof Error ? e.message : 'Gagal memuat katalog',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, outletId])

  const categories = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of catalog) {
      if (item.category_id && item.category_name) {
        map.set(item.category_id, item.category_name)
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [catalog])

  const filteredCatalog = catalog.filter((item) => {
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q)
    const matchesCategory =
      categoryFilter === 'all' || item.category_id === categoryFilter
    return matchesSearch && matchesCategory
  })

  function resetCart() {
    setCart([])
    setDiscount('')
    setPayments([{ payment_method: 'cash', amount: '' }])
    setCheckoutError(null)
    setResult(null)
  }

  function addToCart(item: CatalogItem) {
    if (item.price == null) return
    setResult(null)
    setCart((current) => {
      const existing = current.find((c) => c.product_id === item.product_id)
      if (existing) {
        return current.map((c) =>
          c.product_id === item.product_id
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        )
      }
      return [
        ...current,
        {
          product_id: item.product_id,
          name: item.name,
          sku: item.sku,
          price: item.price as number,
          quantity: 1,
        },
      ]
    })
  }

  function changeQty(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((c) =>
          c.product_id === productId
            ? { ...c, quantity: c.quantity + delta }
            : c,
        )
        .filter((c) => c.quantity > 0),
    )
  }

  function removeLine(productId: string) {
    setCart((current) => current.filter((c) => c.product_id !== productId))
  }

  const subtotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0)
  const discountValue = Math.max(0, Math.round(Number(discount) || 0))
  const effectiveDiscount = Math.min(discountValue, subtotal)
  const total = subtotal - effectiveDiscount
  const paymentsTotal = payments.reduce(
    (sum, p) => sum + (Math.round(Number(p.amount) || 0) || 0),
    0,
  )
  const remaining = total - paymentsTotal

  function updatePayment(index: number, patch: Partial<PaymentRow>) {
    setPayments((current) =>
      current.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    )
  }

  function addPaymentRow() {
    setPayments((current) => [
      ...current,
      { payment_method: 'cash', amount: '' },
    ])
  }

  function removePaymentRow(index: number) {
    setPayments((current) => current.filter((_, i) => i !== index))
  }

  function fillRemaining(index: number) {
    const others = payments.reduce(
      (sum, p, i) =>
        i === index ? sum : sum + (Math.round(Number(p.amount) || 0) || 0),
      0,
    )
    const fill = Math.max(0, total - others)
    updatePayment(index, { amount: String(fill) })
  }

  const canCheckout =
    !!outletId && cart.length > 0 && total > 0 && remaining === 0 && !submitting

  async function handleCheckout() {
    if (!accessToken || !canCheckout) return
    setSubmitting(true)
    setCheckoutError(null)
    try {
      const detail = await checkout(accessToken, {
        outlet_id: outletId,
        discount_amount: effectiveDiscount,
        items: cart.map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
        })),
        payments: payments
          .filter((p) => Math.round(Number(p.amount) || 0) > 0)
          .map((p) => ({
            payment_method: p.payment_method,
            amount: Math.round(Number(p.amount)),
          })),
      })
      setResult(detail)
      setCart([])
      setDiscount('')
      setPayments([{ payment_method: 'cash', amount: '' }])
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Checkout gagal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Kasir (POS)
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
        <div className="w-64">
          <Select
            value={outletId}
            onValueChange={(v) => {
              setOutletId(v)
              resetCart()
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih outlet" />
            </SelectTrigger>
            <SelectContent>
              {outlets
                .filter((o) => o.is_active)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {result && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary">
            <Check className="size-5" />
            <p className="font-semibold">Transaksi berhasil</p>
          </div>
          <p className="text-sm text-[var(--sea-ink)]">
            Invoice <span className="font-mono">{result.invoice_number}</span> —
            Total {formatIDR(result.total_amount)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/transactions/$transactionId"
                params={{ transactionId: result.id }}
              >
                Lihat Detail
              </Link>
            </Button>
            <Button size="sm" onClick={() => setResult(null)}>
              Transaksi Baru
            </Button>
          </div>
        </div>
      )}

      {!outletId ? (
        <div className="rounded-lg border border-[var(--line)] bg-background p-10 text-center text-[var(--sea-ink-soft)]">
          Pilih outlet untuk memulai transaksi.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Catalog */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--sea-ink-soft)]" />
                <Input
                  placeholder="Cari produk / SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua kategori</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {catalogError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {catalogError}
              </p>
            ) : catalogLoading ? (
              <p className="text-sm text-[var(--sea-ink-soft)]">
                Memuat katalog...
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredCatalog.length === 0 ? (
                  <p className="text-sm text-[var(--sea-ink-soft)]">
                    Tidak ada produk.
                  </p>
                ) : (
                  filteredCatalog.map((item) => {
                    const sellable = item.price != null
                    return (
                      <button
                        key={item.product_id}
                        type="button"
                        onClick={() => addToCart(item)}
                        disabled={!sellable}
                        className="flex flex-col items-start gap-1 rounded-lg border border-[var(--line)] bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="text-xs text-[var(--sea-ink-soft)]">
                          {item.sku}
                        </span>
                        <span className="font-medium text-[var(--sea-ink)]">
                          {item.name}
                        </span>
                        <span className="text-sm font-semibold text-primary">
                          {sellable
                            ? formatIDR(item.price as number)
                            : 'Belum ada harga'}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Cart */}
          <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
                Keranjang
              </h3>
              {cart.length > 0 && (
                <Button size="xs" variant="ghost" onClick={resetCart}>
                  <Trash2 />
                  Reset
                </Button>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--sea-ink-soft)]">
                Keranjang kosong.
              </p>
            ) : (
              <div className="space-y-2">
                {cart.map((line) => (
                  <div
                    key={line.product_id}
                    className="flex items-center gap-2 rounded-md border border-[var(--line)] p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--sea-ink)]">
                        {line.name}
                      </p>
                      <p className="text-xs text-[var(--sea-ink-soft)]">
                        {formatIDR(line.price)} × {line.quantity} ={' '}
                        {formatIDR(line.price * line.quantity)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => changeQty(line.product_id, -1)}
                      >
                        <Minus />
                      </Button>
                      <span className="w-6 text-center text-sm">
                        {line.quantity}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => changeQty(line.product_id, 1)}
                      >
                        <Plus />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeLine(line.product_id)}
                      >
                        <X />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-[var(--line)] pt-3 text-sm">
              <div className="flex justify-between text-[var(--sea-ink-soft)]">
                <span>Subtotal</span>
                <span>{formatIDR(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor="pos-discount"
                  className="text-[var(--sea-ink-soft)]"
                >
                  Diskon
                </Label>
                <Input
                  id="pos-discount"
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="h-8 w-32 text-right"
                  placeholder="0"
                />
              </div>
              <div className="flex justify-between text-base font-semibold text-[var(--sea-ink)]">
                <span>Total</span>
                <span>{formatIDR(total)}</span>
              </div>
            </div>

            <div className="space-y-2 border-t border-[var(--line)] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--sea-ink)]">
                  Pembayaran
                </span>
                <Button size="xs" variant="outline" onClick={addPaymentRow}>
                  <Plus />
                  Split
                </Button>
              </div>
              {payments.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={p.payment_method}
                    onValueChange={(v) =>
                      updatePayment(i, { payment_method: v as PaymentMethod })
                    }
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    value={p.amount}
                    onChange={(e) =>
                      updatePayment(i, { amount: e.target.value })
                    }
                    className="h-8 flex-1 text-right"
                    placeholder="0"
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => fillRemaining(i)}
                    title="Isi sisa"
                  >
                    Sisa
                  </Button>
                  {payments.length > 1 && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removePaymentRow(i)}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex justify-between text-sm">
                <span className="text-[var(--sea-ink-soft)]">Dibayar</span>
                <span>{formatIDR(paymentsTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--sea-ink-soft)]">
                  {remaining >= 0 ? 'Sisa' : 'Kelebihan'}
                </span>
                <span
                  className={
                    remaining === 0
                      ? 'text-primary'
                      : 'font-medium text-destructive'
                  }
                >
                  {formatIDR(Math.abs(remaining))}
                </span>
              </div>
            </div>

            {checkoutError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {checkoutError}
              </p>
            )}

            <Button
              className="w-full"
              onClick={handleCheckout}
              disabled={!canCheckout}
            >
              {submitting ? 'Memproses...' : `Bayar ${formatIDR(total)}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
