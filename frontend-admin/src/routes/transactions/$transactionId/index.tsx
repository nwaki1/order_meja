import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import { getTransaction } from '#/lib/transactions.ts'
import type { TransactionDetail } from '#/lib/transactions.ts'

export const Route = createFileRoute('/transactions/$transactionId/')({
  component: TransactionDetailPage,
})

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  card: 'Kartu',
}

function TransactionDetailPage() {
  const { transactionId } = Route.useParams()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [tx, setTx] = React.useState<TransactionDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    getTransaction(accessToken, transactionId)
      .then((data) => {
        if (!cancelled) setTx(data)
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
  }, [accessToken, transactionId])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-48 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (loadError || !tx) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/transactions">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Transaksi tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/transactions">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Detail Transaksi
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-[var(--line)] bg-background p-6 sm:grid-cols-2">
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Invoice</p>
          <p className="font-mono font-semibold text-[var(--sea-ink)]">
            {tx.invoice_number}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Status</p>
          <span
            className={
              tx.status === 'completed'
                ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
            }
          >
            {tx.status}
          </span>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Outlet</p>
          <p className="text-[var(--sea-ink)]">
            {tx.outlet_name} ({tx.outlet_code})
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Kasir</p>
          <p className="text-[var(--sea-ink)]">{tx.cashier_name ?? '-'}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Waktu</p>
          <p className="text-[var(--sea-ink)]">
            {new Date(tx.transaction_at).toLocaleString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Shift</p>
          <p className="text-[var(--sea-ink)]">
            {tx.shift_name
              ? `${tx.shift_name}${tx.shift_work_date ? ` (${tx.shift_work_date})` : ''}`
              : '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Worker Shift</p>
          <p className="text-[var(--sea-ink)]">
            {tx.shift_workers.length > 0
              ? tx.shift_workers.map((w) => w.name).join(', ')
              : '-'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-[var(--line)] bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Produk
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                SKU
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Harga
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Qty
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {tx.items.map((item) => (
              <tr key={item.id} className="bg-background">
                <td className="px-4 py-3 text-[var(--sea-ink)]">
                  {item.product_name_snapshot}
                  <span className="ml-1 text-xs text-[var(--sea-ink-soft)]">
                    / {item.unit_snapshot}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                  {item.sku_snapshot}
                </td>
                <td className="px-4 py-3 text-right text-[var(--sea-ink-soft)]">
                  {formatIDR(item.unit_price)}
                </td>
                <td className="px-4 py-3 text-right text-[var(--sea-ink)]">
                  {item.quantity}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[var(--sea-ink)]">
                  {formatIDR(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-background p-4">
          <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
            Pembayaran
          </h3>
          {tx.payments.map((p) => (
            <div key={p.id} className="flex justify-between text-sm">
              <span className="text-[var(--sea-ink-soft)]">
                {PAYMENT_LABELS[p.payment_method] ?? p.payment_method}
                {p.reference_number ? ` (${p.reference_number})` : ''}
              </span>
              <span className="text-[var(--sea-ink)]">
                {formatIDR(p.amount)}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-background p-4">
          <div className="flex justify-between text-sm text-[var(--sea-ink-soft)]">
            <span>Subtotal</span>
            <span>{formatIDR(tx.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-[var(--sea-ink-soft)]">
            <span>Diskon</span>
            <span>-{formatIDR(tx.discount_amount)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--line)] pt-2 text-base font-semibold text-[var(--sea-ink)]">
            <span>Total</span>
            <span>{formatIDR(tx.total_amount)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
