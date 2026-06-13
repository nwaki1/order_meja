import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Boxes, HardHat, Package, Receipt, Store, Wallet } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { getDashboard, formatIDR } from '#/lib/reports.ts'
import type { DashboardSummary } from '#/lib/reports.ts'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { session, user, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canViewReports = hasPermission('reports:read')

  const [data, setData] = React.useState<DashboardSummary | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!accessToken || !canViewReports) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getDashboard(accessToken)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Gagal memuat dashboard')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, canViewReports])

  if (!canViewReports) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
          Selamat datang{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p className="text-sm text-[var(--sea-ink-soft)]">
          Gunakan menu di samping untuk mengelola data yang dapat Anda akses.
        </p>
      </div>
    )
  }

  const moneyCards = [
    {
      label: 'Penjualan Hari Ini',
      value: data ? formatIDR(data.today_revenue) : '—',
      sub: data ? `${data.today_transaction_count} transaksi` : '',
      icon: Receipt,
    },
    {
      label: 'Penjualan Bulan Ini',
      value: data ? formatIDR(data.month_revenue) : '—',
      sub: data ? `${data.month_transaction_count} transaksi` : '',
      icon: Wallet,
    },
  ]

  const countCards = [
    {
      label: 'Outlet Aktif',
      value: data?.active_outlet_count ?? 0,
      icon: Store,
    },
    {
      label: 'Produk Aktif',
      value: data?.active_product_count ?? 0,
      icon: Package,
    },
    {
      label: 'Worker Aktif',
      value: data?.active_worker_count ?? 0,
      icon: HardHat,
    },
    {
      label: 'Shift Terbuka',
      value: data?.open_shift_count ?? 0,
      icon: Boxes,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
          Dashboard
        </h2>
        <Link
          to="/reports"
          className="text-sm font-medium text-primary hover:underline"
        >
          Lihat semua report →
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-[var(--line)] bg-muted"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {moneyCards.map((c) => (
              <div
                key={c.label}
                className="rounded-lg border border-[var(--line)] bg-background p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--sea-ink-soft)]">
                    {c.label}
                  </p>
                  <c.icon className="size-5 text-primary" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--sea-ink)]">
                  {c.value}
                </p>
                <p className="text-xs text-[var(--sea-ink-soft)]">{c.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {countCards.map((c) => (
              <div
                key={c.label}
                className="rounded-lg border border-[var(--line)] bg-background p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--sea-ink-soft)]">
                    {c.label}
                  </p>
                  <c.icon className="size-5 text-[var(--sea-ink-soft)]" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--sea-ink)]">
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
