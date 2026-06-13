import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Eye, Pencil, Trash2, X } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { WorkerForm } from '#/components/worker-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import { listOutlets } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
import { listWorkerIncentives } from '#/lib/shift-targets.ts'
import type { WorkerIncentive } from '#/lib/shift-targets.ts'
import {
  getSalarySetting,
  listWorkerPayrolls,
  updateSalarySetting,
} from '#/lib/payroll.ts'
import type { Payroll, SalarySetting } from '#/lib/payroll.ts'
import { MONTH_NAMES } from '#/routes/payroll-periods/index.tsx'
import {
  assignOutletWorker,
  deactivateWorker,
  getWorker,
  listOutletWorkers,
  revokeOutletWorker,
} from '#/lib/workers.ts'
import type { Worker } from '#/lib/workers.ts'

export const Route = createFileRoute('/workers/$workerId/')({
  component: WorkerDetailPage,
})

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function WorkerDetailPage() {
  const { workerId } = Route.useParams()
  const router = useRouter()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken

  const canUpdate = hasPermission('workers:update')
  const canDelete = hasPermission('workers:delete')
  const canManageAssignment =
    hasPermission('worker_outlets:manage') && hasPermission('outlets:read')

  const [worker, setWorker] = React.useState<Worker | null>(null)
  const [outlets, setOutlets] = React.useState<Outlet[]>([])
  const [assignedOutletIds, setAssignedOutletIds] = React.useState<Set<string>>(
    new Set(),
  )
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [busyOutletId, setBusyOutletId] = React.useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const canReadIncentives = hasPermission('worker_incentives:read')
  const [incentives, setIncentives] = React.useState<WorkerIncentive[]>([])
  const [incentiveTotal, setIncentiveTotal] = React.useState(0)
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')

  const canReadSalary = hasPermission('worker_salary_settings:read')
  const canUpdateSalary = hasPermission('worker_salary_settings:update')
  const canReadPayrolls = hasPermission('payrolls:read')
  const [salary, setSalary] = React.useState<SalarySetting | null>(null)
  const [salaryEditing, setSalaryEditing] = React.useState(false)
  const [salaryValue, setSalaryValue] = React.useState('')
  const [salaryActive, setSalaryActive] = React.useState(true)
  const [salaryBusy, setSalaryBusy] = React.useState(false)
  const [salaryError, setSalaryError] = React.useState<string | null>(null)
  const [salaryRefresh, setSalaryRefresh] = React.useState(0)
  const [payrolls, setPayrolls] = React.useState<Payroll[]>([])

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    if (canReadSalary) {
      getSalarySetting(accessToken, workerId)
        .then((s) => {
          if (!cancelled) setSalary(s)
        })
        .catch(() => {})
    }
    if (canReadPayrolls) {
      listWorkerPayrolls(accessToken, workerId, { $top: 100, $skip: 0 })
        .then((res) => {
          if (!cancelled) setPayrolls(res.value ?? [])
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [accessToken, workerId, canReadSalary, canReadPayrolls, salaryRefresh])

  function startEditSalary() {
    setSalaryValue(String(salary?.base_salary ?? 0))
    setSalaryActive(salary?.is_active ?? true)
    setSalaryError(null)
    setSalaryEditing(true)
  }

  async function handleSaveSalary() {
    if (!accessToken) return
    const value = Math.round(Number(salaryValue) || 0)
    if (value < 0) {
      setSalaryError('Gaji pokok tidak boleh negatif')
      return
    }
    setSalaryBusy(true)
    setSalaryError(null)
    try {
      await updateSalarySetting(accessToken, workerId, {
        base_salary: value,
        is_active: salaryActive,
      })
      setSalaryEditing(false)
      setSalaryRefresh((k) => k + 1)
    } catch (e) {
      setSalaryError(e instanceof Error ? e.message : 'Gagal menyimpan gaji')
    } finally {
      setSalaryBusy(false)
    }
  }

  React.useEffect(() => {
    if (!accessToken || !canReadIncentives) return
    let cancelled = false
    listWorkerIncentives(accessToken, workerId, {
      $top: 100,
      $skip: 0,
      $count: true,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then((res) => {
        if (!cancelled) {
          const rows = res.value ?? []
          setIncentives(rows)
          setIncentiveTotal(rows.reduce((sum, i) => sum + i.amount, 0))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIncentives([])
          setIncentiveTotal(0)
        }
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, workerId, canReadIncentives, dateFrom, dateTo])

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    async function load() {
      try {
        const workerData = await getWorker(accessToken as string, workerId)
        if (cancelled) return
        setWorker(workerData)

        // Outlets belonging to the worker's tenant.
        const outletsRes = canManageAssignment
          ? await listOutlets(accessToken as string, {
              $top: 100,
              $skip: 0,
              $orderby: 'name asc',
            })
          : { value: [] as Outlet[] }
        const tenantOutlets = (
          Array.isArray(outletsRes) ? outletsRes : (outletsRes.value ?? [])
        ).filter(
          (o) => o.current_tenant_id === workerData.tenant_id && o.is_active,
        )
        if (cancelled) return
        setOutlets(tenantOutlets)

        // Determine which of those outlets the worker is actively assigned to.
        const assigned = new Set<string>()
        await Promise.all(
          tenantOutlets.map(async (o) => {
            try {
              const res = await listOutletWorkers(accessToken as string, o.id)
              const found = res.value.find(
                (w) => w.worker_id === workerId && w.is_active,
              )
              if (found) assigned.add(o.id)
            } catch {
              // ignore individual outlet errors
            }
          }),
        )
        if (!cancelled) setAssignedOutletIds(assigned)
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : 'Gagal memuat data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accessToken, workerId, refreshKey, canManageAssignment])

  async function handleDelete() {
    if (!accessToken || !worker) return
    setDeleting(true)
    try {
      await deactivateWorker(accessToken, worker.id)
      router.navigate({ to: '/workers' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan worker')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function toggleAssignment(outletId: string, assigned: boolean) {
    if (!accessToken || !worker) return
    setBusyOutletId(outletId)
    try {
      if (assigned) {
        await revokeOutletWorker(accessToken, outletId, worker.id)
      } else {
        await assignOutletWorker(accessToken, outletId, worker.id)
      }
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal memperbarui assignment')
    } finally {
      setBusyOutletId(null)
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

  if (loadError || !worker) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/workers">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Worker tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/workers">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Worker
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
                to="/workers/$workerId/edit"
                params={{ workerId: worker.id }}
              >
                <Pencil />
                Edit
              </Link>
            </Button>
          )}
          {canDelete &&
            worker.is_active &&
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
        <WorkerForm mode="view" initialData={worker} />
      </div>

      {canManageAssignment && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <div>
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              Assignment Outlet
            </h3>
            <p className="text-xs text-[var(--sea-ink-soft)]">
              Outlet pada tenant {worker.tenant_name} yang dapat di-assign ke
              worker ini.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[var(--line)] bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Outlet
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {outlets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                    >
                      Tidak ada outlet aktif pada tenant ini.
                    </td>
                  </tr>
                ) : (
                  outlets.map((o) => {
                    const assigned = assignedOutletIds.has(o.id)
                    return (
                      <tr key={o.id} className="bg-background">
                        <td className="px-4 py-3 text-[var(--sea-ink)]">
                          {o.name}{' '}
                          <span className="text-xs text-[var(--sea-ink-soft)]">
                            ({o.code})
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              assigned
                                ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                                : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                            }
                          >
                            {assigned ? 'Assigned' : 'Tidak'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={
                                busyOutletId === o.id || !worker.is_active
                              }
                              className={
                                assigned
                                  ? 'text-destructive hover:text-destructive'
                                  : ''
                              }
                              onClick={() => toggleAssignment(o.id, assigned)}
                            >
                              {assigned ? 'Revoke' : 'Assign'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canReadSalary && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
                Salary Setting
              </h3>
              <p className="text-xs text-[var(--sea-ink-soft)]">
                Gaji pokok dasar untuk perhitungan payroll.
              </p>
            </div>
            {canUpdateSalary && !salaryEditing && (
              <Button size="sm" variant="outline" onClick={startEditSalary}>
                <Pencil />
                Edit
              </Button>
            )}
          </div>

          {salaryEditing ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-[var(--sea-ink-soft)]">
                    Gaji Pokok (Rp)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={salaryValue}
                    onChange={(e) => setSalaryValue(e.target.value)}
                    className="w-48"
                    disabled={salaryBusy}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm text-[var(--sea-ink)]">
                  <input
                    type="checkbox"
                    checked={salaryActive}
                    onChange={(e) => setSalaryActive(e.target.checked)}
                    disabled={salaryBusy}
                  />
                  Aktif
                </label>
              </div>
              {salaryError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {salaryError}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveSalary}
                  disabled={salaryBusy}
                >
                  {salaryBusy ? 'Menyimpan...' : 'Simpan'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSalaryEditing(false)}
                  disabled={salaryBusy}
                >
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-[var(--sea-ink-soft)]">Gaji Pokok</p>
                <p className="text-lg font-semibold text-[var(--sea-ink)]">
                  {formatIDR(salary?.base_salary ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--sea-ink-soft)]">Status</p>
                <span
                  className={
                    salary?.is_active
                      ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                      : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                  }
                >
                  {salary?.is_active ? 'Aktif' : 'Belum diatur / Nonaktif'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {canReadPayrolls && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
            Payroll History
          </h3>
          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[var(--line)] bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Periode
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Status
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {payrolls.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                    >
                      Belum ada payroll.
                    </td>
                  </tr>
                ) : (
                  payrolls.map((p) => (
                    <tr key={p.id} className="bg-background">
                      <td className="px-4 py-3 text-[var(--sea-ink)]">
                        {MONTH_NAMES[p.month]} {p.year}
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
                        <span
                          className={
                            p.status === 'finalized'
                              ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                              : 'inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600'
                          }
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
      )}

      {canReadIncentives && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
                Riwayat Insentif
              </h3>
              <p className="text-xs text-[var(--sea-ink-soft)]">
                Total periode: {formatIDR(incentiveTotal)}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-[var(--sea-ink-soft)]">
                  Dari
                </Label>
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
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[var(--line)] bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Tanggal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Shift
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Outlet
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Target
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Insentif
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {incentives.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                    >
                      Belum ada insentif.
                    </td>
                  </tr>
                ) : (
                  incentives.map((i) => (
                    <tr key={i.id} className="bg-background">
                      <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                        {i.work_date}
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink)]">
                        {i.shift_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                        {i.outlet_name}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--sea-ink-soft)]">
                        {formatIDR(i.target_value)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--sea-ink)]">
                        {formatIDR(i.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
