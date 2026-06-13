import React from 'react'
import { createFileRoute } from '@tanstack/react-router'

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
import { listOutlets } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
import { listTenants } from '#/lib/tenants.ts'
import type { Tenant } from '#/lib/tenants.ts'
import {
  formatIDR,
  getPayrollSummaryReport,
  getProductSalesReport,
  getSalesReport,
  getShiftPerformanceReport,
  getStockReport,
  getWorkerIncentiveReport,
} from '#/lib/reports.ts'
import type {
  PayrollSummaryRow,
  ProductSalesRow,
  ReportFilters,
  SalesRow,
  ShiftPerfRow,
  StockRow,
  WorkerIncentiveRow,
} from '#/lib/reports.ts'

export const Route = createFileRoute('/reports/')({
  component: ReportsPage,
})

const MONTH_NAMES = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

type Tab = 'sales' | 'products' | 'stock' | 'shifts' | 'incentives' | 'payroll'

const TABS: { key: Tab; label: string }[] = [
  { key: 'sales', label: 'Penjualan' },
  { key: 'products', label: 'Produk Terjual' },
  { key: 'stock', label: 'Stok' },
  { key: 'shifts', label: 'Performa Shift' },
  { key: 'incentives', label: 'Insentif Worker' },
  { key: 'payroll', label: 'Ringkasan Payroll' },
]

// Which filters each tab actually uses.
const USES = {
  sales: { outlet: true, date: true },
  products: { outlet: true, date: true },
  stock: { outlet: true, date: false },
  shifts: { outlet: true, date: true },
  incentives: { outlet: false, date: true },
  payroll: { outlet: false, date: false },
} as const

function ReportsPage() {
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canView = hasPermission('reports:read')

  const [tab, setTab] = React.useState<Tab>('sales')
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [outlets, setOutlets] = React.useState<Outlet[]>([])

  const [tenant, setTenant] = React.useState('all')
  const [outlet, setOutlet] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')

  const [rows, setRows] = React.useState<unknown[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!accessToken || !canView) return
    listTenants(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setTenants(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
    listOutlets(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setOutlets(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
  }, [accessToken, canView])

  React.useEffect(() => {
    if (!accessToken || !canView) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const filters: ReportFilters = {}
    if (tenant !== 'all') filters.tenant_id = tenant
    if (USES[tab].outlet && outlet !== 'all') filters.outlet_id = outlet
    if (USES[tab].date) {
      if (dateFrom) filters.date_from = dateFrom
      if (dateTo) filters.date_to = dateTo
    }

    const fetcher = (() => {
      switch (tab) {
        case 'sales':
          return getSalesReport(accessToken, { ...filters, group_by: 'day' })
        case 'products':
          return getProductSalesReport(accessToken, { ...filters, limit: 50 })
        case 'stock':
          return getStockReport(accessToken, filters)
        case 'shifts':
          return getShiftPerformanceReport(accessToken, filters)
        case 'incentives':
          return getWorkerIncentiveReport(accessToken, filters)
        case 'payroll':
          return getPayrollSummaryReport(accessToken, filters)
      }
    })()

    fetcher
      .then((res) => {
        if (!cancelled) setRows(res.value ?? [])
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Gagal memuat report')
          setRows([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, canView, tab, tenant, outlet, dateFrom, dateTo])

  if (!canView) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Reports</h2>
        <p className="text-sm text-destructive">
          Anda tidak memiliki akses ke report.
        </p>
      </div>
    )
  }

  const usesOutlet = USES[tab].outlet
  const usesDate = USES[tab].date

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Reports</h2>
        <div className="mt-1">
          <AdminBreadcrumbs />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? 'bright' : 'outline'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Tenant</Label>
          <Select value={tenant} onValueChange={setTenant}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua tenant</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {usesOutlet && (
          <div className="space-y-1">
            <Label className="text-xs text-[var(--sea-ink-soft)]">Outlet</Label>
            <Select value={outlet} onValueChange={setOutlet}>
              <SelectTrigger size="sm" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua outlet</SelectItem>
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {usesDate && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-[var(--sea-ink-soft)]">Dari</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[var(--sea-ink-soft)]">
                Sampai
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
          </>
        )}
        {loading && (
          <span className="animate-pulse text-xs text-[var(--sea-ink-soft)]">
            Memuat...
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
        <ReportTable tab={tab} rows={rows} loading={loading} />
      </div>
    </div>
  )
}

const TH =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]'
const THR = TH.replace('text-left', 'text-right')

function ReportTable({
  tab,
  rows,
  loading,
}: {
  tab: Tab
  rows: unknown[]
  loading: boolean
}) {
  const headers: Record<Tab, React.ReactNode> = {
    sales: (
      <tr>
        <th className={TH}>Label</th>
        <th className={THR}>Transaksi</th>
        <th className={THR}>Diskon</th>
        <th className={THR}>Revenue</th>
      </tr>
    ),
    products: (
      <tr>
        <th className={TH}>SKU</th>
        <th className={TH}>Produk</th>
        <th className={THR}>Qty</th>
        <th className={THR}>Revenue</th>
      </tr>
    ),
    stock: (
      <tr>
        <th className={TH}>Outlet</th>
        <th className={TH}>Produk</th>
        <th className={THR}>Stok</th>
      </tr>
    ),
    shifts: (
      <tr>
        <th className={TH}>Tanggal</th>
        <th className={TH}>Shift</th>
        <th className={TH}>Outlet</th>
        <th className={THR}>Revenue</th>
        <th className={THR}>Target</th>
        <th className={TH}>Hasil</th>
        <th className={THR}>Insentif</th>
      </tr>
    ),
    incentives: (
      <tr>
        <th className={TH}>Worker</th>
        <th className={TH}>Tenant</th>
        <th className={THR}>Jumlah</th>
        <th className={THR}>Total Insentif</th>
      </tr>
    ),
    payroll: (
      <tr>
        <th className={TH}>Periode</th>
        <th className={TH}>Tenant</th>
        <th className={TH}>Status</th>
        <th className={THR}>Worker</th>
        <th className={THR}>Grand Total</th>
      </tr>
    ),
  }

  const colCount: Record<Tab, number> = {
    sales: 4,
    products: 4,
    stock: 3,
    shifts: 7,
    incentives: 4,
    payroll: 5,
  }

  function renderRows() {
    if (rows.length === 0) {
      return (
        <tr>
          <td
            colSpan={colCount[tab]}
            className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
          >
            {loading ? 'Memuat...' : 'Tidak ada data.'}
          </td>
        </tr>
      )
    }
    const cell = 'px-4 py-3 text-[var(--sea-ink)]'
    const cellR = 'px-4 py-3 text-right text-[var(--sea-ink)]'
    const cellSoft = 'px-4 py-3 text-[var(--sea-ink-soft)]'
    switch (tab) {
      case 'sales':
        return (rows as SalesRow[]).map((r, i) => (
          <tr key={i} className="bg-background">
            <td className={cell}>{r.label}</td>
            <td className={cellR}>{r.transaction_count}</td>
            <td className={cellR}>{formatIDR(r.total_discount)}</td>
            <td className={cellR + ' font-semibold'}>
              {formatIDR(r.gross_revenue)}
            </td>
          </tr>
        ))
      case 'products':
        return (rows as ProductSalesRow[]).map((r) => (
          <tr key={r.product_id} className="bg-background">
            <td className={cellSoft}>{r.sku}</td>
            <td className={cell}>{r.name}</td>
            <td className={cellR}>{r.quantity_sold}</td>
            <td className={cellR + ' font-semibold'}>{formatIDR(r.revenue)}</td>
          </tr>
        ))
      case 'stock':
        return (rows as StockRow[]).map((r, i) => (
          <tr key={i} className="bg-background">
            <td className={cellSoft}>{r.outlet_name}</td>
            <td className={cell}>
              {r.name}{' '}
              <span className="text-xs text-[var(--sea-ink-soft)]">
                ({r.sku})
              </span>
            </td>
            <td className={cellR}>
              {r.quantity} {r.unit}
            </td>
          </tr>
        ))
      case 'shifts':
        return (rows as ShiftPerfRow[]).map((r) => (
          <tr key={r.shift_id} className="bg-background">
            <td className={cellSoft}>{r.work_date}</td>
            <td className={cell}>{r.name_snapshot}</td>
            <td className={cellSoft}>{r.outlet_name}</td>
            <td className={cellR}>{formatIDR(r.revenue)}</td>
            <td className={cellR}>
              {r.target_value != null ? formatIDR(r.target_value) : '-'}
            </td>
            <td className="px-4 py-3">
              {r.is_achieved == null ? (
                <span className="text-[var(--sea-ink-soft)]">-</span>
              ) : (
                <span
                  className={
                    r.is_achieved
                      ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                      : 'inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive'
                  }
                >
                  {r.is_achieved ? 'Tercapai' : 'Tidak'}
                </span>
              )}
            </td>
            <td className={cellR}>{formatIDR(r.incentive_total)}</td>
          </tr>
        ))
      case 'incentives':
        return (rows as WorkerIncentiveRow[]).map((r) => (
          <tr key={r.worker_id} className="bg-background">
            <td className={cell}>
              {r.worker_name}{' '}
              <span className="text-xs text-[var(--sea-ink-soft)]">
                ({r.worker_code})
              </span>
            </td>
            <td className={cellSoft}>{r.tenant_name}</td>
            <td className={cellR}>{r.incentive_count}</td>
            <td className={cellR + ' font-semibold'}>
              {formatIDR(r.incentive_total)}
            </td>
          </tr>
        ))
      case 'payroll':
        return (rows as PayrollSummaryRow[]).map((r) => (
          <tr key={r.payroll_period_id} className="bg-background">
            <td className={cell}>
              {MONTH_NAMES[r.month]} {r.year}
            </td>
            <td className={cellSoft}>{r.tenant_name}</td>
            <td className={cellSoft}>{r.status}</td>
            <td className={cellR}>{r.worker_count}</td>
            <td className={cellR + ' font-semibold'}>
              {formatIDR(r.total_grand)}
            </td>
          </tr>
        ))
    }
  }

  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead className="border-b border-[var(--line)] bg-muted/40">
        {headers[tab]}
      </thead>
      <tbody className="divide-y divide-[var(--line)]">{renderRows()}</tbody>
    </table>
  )
}
