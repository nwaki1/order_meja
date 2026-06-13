import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Ban, Calculator, Eye, Lock } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  calculatePayrollPeriod,
  cancelPayrollPeriod,
  finalizePayrollPeriod,
  getPayrollPeriod,
} from '#/lib/payroll.ts'
import type { PayrollPeriodDetail } from '#/lib/payroll.ts'
import { MONTH_NAMES, formatIDR } from '#/routes/payroll-periods/index.tsx'

export const Route = createFileRoute('/payroll-periods/$periodId/')({
  component: PayrollPeriodDetailPage,
})

const STATUS_CLASS: Record<string, string> = {
  draft: 'border-amber-400/40 bg-amber-400/10 text-amber-600',
  finalized: 'border-primary/30 bg-primary/10 text-primary',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
}

function PayrollPeriodDetailPage() {
  const { periodId } = Route.useParams()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken

  const canCalculate = hasPermission('payroll_periods:calculate')
  const canFinalize = hasPermission('payroll_periods:finalize')
  const canCancel = hasPermission('payroll_periods:cancel')

  const [detail, setDetail] = React.useState<PayrollPeriodDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getPayrollPeriod(accessToken, periodId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((e) => {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : 'Gagal memuat data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, periodId, refreshKey])

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Aksi gagal')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-48 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (loadError || !detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/payroll-periods">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Payroll period tidak ditemukan.'}
        </p>
      </div>
    )
  }

  const isDraft = detail.status === 'draft'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/payroll-periods">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Payroll {MONTH_NAMES[detail.month]} {detail.year}
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canCalculate && isDraft && (
            <Button
              size="sm"
              onClick={() =>
                runAction(() =>
                  calculatePayrollPeriod(accessToken as string, periodId),
                )
              }
              disabled={busy}
            >
              <Calculator />
              Calculate
            </Button>
          )}
          {canFinalize && isDraft && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runAction(() =>
                  finalizePayrollPeriod(accessToken as string, periodId),
                )
              }
              disabled={busy}
            >
              <Lock />
              Finalize
            </Button>
          )}
          {canCancel && isDraft && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                runAction(() =>
                  cancelPayrollPeriod(accessToken as string, periodId),
                )
              }
              disabled={busy}
            >
              <Ban />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {actionError}
        </p>
      )}

      <div className="grid gap-4 rounded-lg border border-[var(--line)] bg-background p-6 sm:grid-cols-4">
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Tenant</p>
          <p className="text-[var(--sea-ink)]">{detail.tenant_name}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Status</p>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[detail.status] ?? STATUS_CLASS.cancelled}`}
          >
            {detail.status}
          </span>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Jumlah Worker</p>
          <p className="text-[var(--sea-ink)]">{detail.worker_count}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Total Payroll</p>
          <p className="font-semibold text-[var(--sea-ink)]">
            {formatIDR(detail.total_payroll)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--line)] bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Worker
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Gaji Pokok
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Insentif
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Adjustment
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Potongan
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Grand Total
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {detail.payrolls.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Belum ada payroll. Jalankan Calculate.
                </td>
              </tr>
            ) : (
              detail.payrolls.map((p) => (
                <tr key={p.id} className="bg-background">
                  <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                    {p.worker_name}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--sea-ink-soft)]">
                    {formatIDR(p.base_salary)}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--sea-ink-soft)]">
                    {formatIDR(p.incentive_total)}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--sea-ink-soft)]">
                    {formatIDR(p.adjustment_total)}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--sea-ink-soft)]">
                    {formatIDR(p.deduction_total)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--sea-ink)]">
                    {formatIDR(p.grand_total)}
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
                          to="/payrolls/$payrollId"
                          params={{ payrollId: p.id }}
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
    </div>
  )
}
