import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Eye, Plus, X } from 'lucide-react'

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
import { listTenants } from '#/lib/tenants.ts'
import type { Tenant } from '#/lib/tenants.ts'
import { listPayrollPeriods } from '#/lib/payroll.ts'
import type { PayrollPeriod, PayrollPeriodListParams } from '#/lib/payroll.ts'

export const Route = createFileRoute('/payroll-periods/')({
  component: PayrollPeriodsPage,
})

export const MONTH_NAMES = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'border-amber-400/40 bg-amber-400/10 text-amber-600',
  finalized: 'border-primary/30 bg-primary/10 text-primary',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const PAGE_SIZE = 20

function PayrollPeriodsPage() {
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canCreate = hasPermission('payroll_periods:create')

  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [periods, setPeriods] = React.useState<PayrollPeriod[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [pageIndex, setPageIndex] = React.useState(0)
  const [tenantFilter, setTenantFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [yearFilter, setYearFilter] = React.useState('')

  React.useEffect(() => {
    if (!accessToken) return
    listTenants(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setTenants(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
  }, [accessToken])

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const params: PayrollPeriodListParams = {
      $top: PAGE_SIZE,
      $skip: pageIndex * PAGE_SIZE,
      $count: true,
    }
    if (tenantFilter !== 'all') params.tenant_id = tenantFilter
    if (statusFilter !== 'all') params.status = statusFilter
    if (yearFilter) params.year = Number(yearFilter)

    listPayrollPeriods(accessToken, params)
      .then((res) => {
        if (!cancelled) {
          setPeriods(res.value ?? [])
          setTotalCount(res['@odata.count'] ?? (res.value ?? []).length)
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Gagal memuat data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, pageIndex, tenantFilter, statusFilter, yearFilter])

  const pageCount = Math.ceil(totalCount / PAGE_SIZE) || 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Payroll
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
        {canCreate && (
          <Button size="sm" variant="bright" asChild>
            <Link to="/payroll-periods/new">
              <Plus />
              Buat Period
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Tenant</Label>
          <Select
            value={tenantFilter}
            onValueChange={(v) => {
              setTenantFilter(v)
              setPageIndex(0)
            }}
          >
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
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v)
              setPageIndex(0)
            }}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Tahun</Label>
          <Input
            type="number"
            placeholder="2026"
            value={yearFilter}
            onChange={(e) => {
              setYearFilter(e.target.value)
              setPageIndex(0)
            }}
            className="w-28"
          />
        </div>
        {(tenantFilter !== 'all' || statusFilter !== 'all' || yearFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTenantFilter('all')
              setStatusFilter('all')
              setYearFilter('')
              setPageIndex(0)
            }}
          >
            <X />
            Reset
          </Button>
        )}
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
                Periode
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Tenant
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Worker
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Total Payroll
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Status
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {error ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-destructive"
                >
                  {error}
                </td>
              </tr>
            ) : loading && periods.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat data...
                </td>
              </tr>
            ) : periods.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Tidak ada payroll period.
                </td>
              </tr>
            ) : (
              periods.map((p) => (
                <tr
                  key={p.id}
                  className="bg-background transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                    {MONTH_NAMES[p.month]} {p.year}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {p.tenant_name}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--sea-ink)]">
                    {p.worker_count}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-[var(--sea-ink)]">
                    {formatIDR(p.total_payroll)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[p.status] ?? STATUS_CLASS.cancelled}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        asChild
                        title="Detail"
                      >
                        <Link
                          to="/payroll-periods/$periodId"
                          params={{ periodId: p.id }}
                        >
                          <Eye />
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-[var(--sea-ink-soft)]">
        <span>{totalCount} period</span>
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            disabled={pageIndex === 0 || loading}
          >
            {'<'}
          </Button>
          <span className="px-2">
            Hal {pageIndex + 1} / {pageCount}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
            disabled={pageIndex >= pageCount - 1 || loading}
          >
            {'>'}
          </Button>
        </div>
      </div>
    </div>
  )
}
