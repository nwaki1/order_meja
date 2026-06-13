import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Ban,
  DoorOpen,
  Lock,
  Pencil,
  Plus,
  Target,
  X,
} from 'lucide-react'

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
import {
  addShiftWorker,
  cancelShift,
  closeShift,
  getShift,
  listShiftWorkers,
  openShift,
  removeShiftWorker,
} from '#/lib/shifts.ts'
import type { Shift, ShiftWorker } from '#/lib/shifts.ts'
import {
  createShiftTarget,
  deactivateShiftTarget,
  listShiftIncentives,
  listShiftTargetResults,
  listShiftTargets,
  updateShiftTarget,
} from '#/lib/shift-targets.ts'
import type {
  ShiftTarget,
  ShiftTargetResult,
  WorkerIncentive,
} from '#/lib/shift-targets.ts'
import { listOutletWorkers } from '#/lib/workers.ts'
import type { WorkerOutlet } from '#/lib/workers.ts'

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

export const Route = createFileRoute('/shifts/$shiftId/')({
  component: ShiftDetailPage,
})

function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

const STATUS_CLASS: Record<string, string> = {
  open: 'border-primary/30 bg-primary/10 text-primary',
  draft: 'border-amber-400/40 bg-amber-400/10 text-amber-600',
  closed: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
}

function ShiftDetailPage() {
  const { shiftId } = Route.useParams()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken

  const canManageWorkers = hasPermission('shift_workers:manage')
  const canOpen = hasPermission('shifts:open')
  const canClose = hasPermission('shifts:close')
  const canCancel = hasPermission('shifts:cancel')
  const canManageTarget =
    hasPermission('shift_targets:create') &&
    hasPermission('shift_targets:update') &&
    hasPermission('shift_targets:delete')

  const [shift, setShift] = React.useState<Shift | null>(null)
  const [workers, setWorkers] = React.useState<ShiftWorker[]>([])
  const [outletWorkers, setOutletWorkers] = React.useState<WorkerOutlet[]>([])
  const [targets, setTargets] = React.useState<ShiftTarget[]>([])
  const [results, setResults] = React.useState<ShiftTargetResult[]>([])
  const [incentives, setIncentives] = React.useState<WorkerIncentive[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [selectedWorker, setSelectedWorker] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  // Target drawer state
  const [targetDrawerOpen, setTargetDrawerOpen] = React.useState(false)
  const [editingTargetId, setEditingTargetId] = React.useState<string | null>(
    null,
  )
  const [tValue, setTValue] = React.useState('')
  const [tBonus, setTBonus] = React.useState('')
  const [targetError, setTargetError] = React.useState<string | null>(null)
  const [savingTarget, setSavingTarget] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    async function load() {
      try {
        const shiftData = await getShift(accessToken as string, shiftId)
        if (cancelled) return
        setShift(shiftData)
        const isClosed = shiftData.status === 'closed'
        const [
          workersRes,
          outletWorkersRes,
          targetsRes,
          resultsRes,
          incentivesRes,
        ] = await Promise.all([
          listShiftWorkers(accessToken as string, shiftId),
          canManageWorkers
            ? listOutletWorkers(accessToken as string, shiftData.outlet_id)
            : Promise.resolve({ value: [] as WorkerOutlet[] }),
          listShiftTargets(accessToken as string, shiftId),
          isClosed
            ? listShiftTargetResults(accessToken as string, shiftId)
            : Promise.resolve({ value: [] as ShiftTargetResult[] }),
          isClosed
            ? listShiftIncentives(accessToken as string, shiftId)
            : Promise.resolve({ value: [] as WorkerIncentive[] }),
        ])
        if (cancelled) return
        setWorkers(workersRes.value ?? [])
        setOutletWorkers(
          (outletWorkersRes.value ?? []).filter((w) => w.is_active),
        )
        setTargets(targetsRes.value ?? [])
        setResults(resultsRes.value ?? [])
        setIncentives(incentivesRes.value ?? [])
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
  }, [accessToken, shiftId, refreshKey, canManageWorkers])

  async function runTransition(fn: () => Promise<Shift>) {
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

  function openCreateTarget() {
    setEditingTargetId(null)
    setTValue('')
    setTBonus('')
    setTargetError(null)
    setTargetDrawerOpen(true)
  }

  function openEditTarget(t: ShiftTarget) {
    setEditingTargetId(t.id)
    setTValue(String(t.target_value))
    setTBonus(String(t.bonus_amount))
    setTargetError(null)
    setTargetDrawerOpen(true)
  }

  async function handleSaveTarget() {
    if (!accessToken) return
    const value = Math.round(Number(tValue) || 0)
    const bonus = Math.round(Number(tBonus) || 0)
    if (value <= 0) {
      setTargetError('Target value harus lebih dari 0')
      return
    }
    if (bonus < 0) {
      setTargetError('Bonus tidak boleh negatif')
      return
    }
    setSavingTarget(true)
    setTargetError(null)
    try {
      if (editingTargetId) {
        await updateShiftTarget(accessToken, editingTargetId, {
          target_value: value,
          bonus_amount: bonus,
        })
      } else {
        await createShiftTarget(accessToken, shiftId, {
          target_type: 'revenue',
          target_value: value,
          bonus_amount: bonus,
        })
      }
      setTargetDrawerOpen(false)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setTargetError(e instanceof Error ? e.message : 'Gagal menyimpan target')
    } finally {
      setSavingTarget(false)
    }
  }

  async function handleDeactivateTarget(id: string) {
    if (!accessToken) return
    setBusy(true)
    setActionError(null)
    try {
      await deactivateShiftTarget(accessToken, id)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Gagal menonaktifkan target',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleAddWorker() {
    if (!accessToken || !selectedWorker) return
    setBusy(true)
    setActionError(null)
    try {
      await addShiftWorker(accessToken, shiftId, selectedWorker)
      setSelectedWorker('')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal menambah worker')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveWorker(workerId: string) {
    if (!accessToken) return
    setBusy(true)
    setActionError(null)
    try {
      await removeShiftWorker(accessToken, shiftId, workerId)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal menghapus worker')
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

  if (loadError || !shift) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/shifts">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Shift tidak ditemukan.'}
        </p>
      </div>
    )
  }

  const assignedIds = new Set(workers.map((w) => w.worker_id))
  const availableWorkers = outletWorkers.filter(
    (w) => !assignedIds.has(w.worker_id),
  )
  const canEditWorkers =
    canManageWorkers && (shift.status === 'draft' || shift.status === 'open')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/shifts">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Shift
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canOpen && shift.status === 'draft' && (
            <Button
              size="sm"
              onClick={() =>
                runTransition(() => openShift(accessToken as string, shiftId))
              }
              disabled={busy}
            >
              <DoorOpen />
              Open
            </Button>
          )}
          {canClose && shift.status === 'open' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runTransition(() => closeShift(accessToken as string, shiftId))
              }
              disabled={busy}
            >
              <Lock />
              Close
            </Button>
          )}
          {canCancel && shift.status === 'draft' && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                runTransition(() => cancelShift(accessToken as string, shiftId))
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

      <div className="grid gap-4 rounded-lg border border-[var(--line)] bg-background p-6 sm:grid-cols-2">
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Shift</p>
          <p className="font-semibold text-[var(--sea-ink)]">
            {shift.name_snapshot}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Status</p>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[shift.status] ?? STATUS_CLASS.closed}`}
          >
            {shift.status}
          </span>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Outlet</p>
          <p className="text-[var(--sea-ink)]">
            {shift.outlet_name} ({shift.outlet_code})
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Tanggal</p>
          <p className="text-[var(--sea-ink)]">{shift.work_date}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Jam</p>
          <p className="text-[var(--sea-ink)]">
            {hhmm(shift.start_time_snapshot)} - {hhmm(shift.end_time_snapshot)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Dibuka / Ditutup</p>
          <p className="text-[var(--sea-ink)]">
            {shift.opened_at
              ? new Date(shift.opened_at).toLocaleString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '-'}
            {' / '}
            {shift.closed_at
              ? new Date(shift.closed_at).toLocaleString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '-'}
          </p>
        </div>
      </div>

      {/* Target Shift */}
      <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              Target Shift
            </h3>
            <p className="text-xs text-[var(--sea-ink-soft)]">
              {shift.status === 'draft'
                ? 'Target hanya dapat diubah saat shift draft.'
                : 'Target terkunci karena shift bukan draft.'}
            </p>
          </div>
          {canManageTarget && shift.status === 'draft' && (
            <Button size="sm" variant="outline" onClick={openCreateTarget}>
              <Target />
              Tambah Target
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--line)] bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Tipe
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Target
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Bonus
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Status
                </th>
                {canManageTarget && shift.status === 'draft' && (
                  <th className="px-4 py-3" />
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {targets.filter((t) => t.is_active).length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      canManageTarget && shift.status === 'draft' ? 5 : 4
                    }
                    className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                  >
                    Belum ada target aktif.
                  </td>
                </tr>
              ) : (
                targets
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <tr key={t.id} className="bg-background">
                      <td className="px-4 py-3 text-[var(--sea-ink)]">
                        {t.target_type}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--sea-ink)]">
                        {formatIDR(t.target_value)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--sea-ink)]">
                        {formatIDR(t.bonus_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          Aktif
                        </span>
                      </td>
                      {canManageTarget && shift.status === 'draft' && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => openEditTarget(t)}
                            >
                              <Pencil />
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeactivateTarget(t.id)}
                              disabled={busy}
                            >
                              Nonaktifkan
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target Result (shown when closed) */}
      {shift.status === 'closed' && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
            Hasil Target
          </h3>
          {results.length === 0 ? (
            <p className="text-sm text-[var(--sea-ink-soft)]">
              Tidak ada target pada shift ini.
            </p>
          ) : (
            results.map((r) => {
              const incForTarget = incentives.filter(
                (i) => i.shift_target_id === r.shift_target_id,
              )
              const bonusTotal = incForTarget.reduce(
                (sum, i) => sum + i.amount,
                0,
              )
              return (
                <div
                  key={r.id}
                  className="space-y-3 rounded-lg border border-[var(--line)] p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-[var(--sea-ink-soft)]">
                        Actual Revenue
                      </p>
                      <p className="font-semibold text-[var(--sea-ink)]">
                        {formatIDR(r.actual_value)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--sea-ink-soft)]">
                        Target
                      </p>
                      <p className="text-[var(--sea-ink)]">
                        {formatIDR(r.target_value)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--sea-ink-soft)]">
                        Achievement
                      </p>
                      <p className="text-[var(--sea-ink)]">
                        {r.achievement_percentage.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--sea-ink-soft)]">
                        Status
                      </p>
                      <span
                        className={
                          r.is_achieved
                            ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                            : 'inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive'
                        }
                      >
                        {r.is_achieved ? 'Tercapai' : 'Tidak tercapai'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--sea-ink-soft)]">
                      Bonus dibagikan: {formatIDR(bonusTotal)}
                    </p>
                    {incForTarget.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {incForTarget.map((i) => (
                          <li
                            key={i.id}
                            className="flex justify-between text-sm"
                          >
                            <span className="text-[var(--sea-ink)]">
                              {i.worker_name}
                            </span>
                            <span className="text-[var(--sea-ink)]">
                              {formatIDR(i.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              Worker Shift
            </h3>
            <p className="text-xs text-[var(--sea-ink-soft)]">
              {workers.length} worker pada shift ini.
            </p>
          </div>
          {canEditWorkers && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select
                value={selectedWorker}
                onValueChange={setSelectedWorker}
                disabled={busy || availableWorkers.length === 0}
              >
                <SelectTrigger size="sm" className="w-56 max-w-full">
                  <SelectValue placeholder="Pilih worker" />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkers.map((w) => (
                    <SelectItem key={w.worker_id} value={w.worker_id}>
                      {w.name} ({w.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleAddWorker}
                disabled={!selectedWorker || busy}
              >
                <Plus />
                Tambah
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--line)] bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Kode
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Nama
                </th>
                {canEditWorkers && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {workers.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEditWorkers ? 3 : 2}
                    className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                  >
                    Belum ada worker.
                  </td>
                </tr>
              ) : (
                workers.map((w) => (
                  <tr key={w.worker_id} className="bg-background">
                    <td className="px-4 py-3 font-semibold text-[var(--sea-ink)]">
                      {w.code}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink)]">
                      {w.name}
                    </td>
                    {canEditWorkers && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveWorker(w.worker_id)}
                            disabled={busy}
                            title="Hapus dari shift"
                          >
                            <X />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={targetDrawerOpen} onOpenChange={setTargetDrawerOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editingTargetId ? 'Edit Target' : 'Tambah Target'}
            </SheetTitle>
            <SheetDescription>
              Target revenue + bonus (dibagi rata ke worker shift saat
              tercapai).
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-value">Target Revenue (Rp)</Label>
              <Input
                id="t-value"
                type="number"
                min={1}
                value={tValue}
                onChange={(e) => setTValue(e.target.value)}
                disabled={savingTarget}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-bonus">Bonus (Rp)</Label>
              <Input
                id="t-bonus"
                type="number"
                min={0}
                value={tBonus}
                onChange={(e) => setTBonus(e.target.value)}
                disabled={savingTarget}
              />
            </div>
            {targetError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {targetError}
              </p>
            )}
          </div>

          <SheetFooter>
            <Button onClick={handleSaveTarget} disabled={savingTarget}>
              {savingTarget ? 'Menyimpan...' : 'Simpan'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setTargetDrawerOpen(false)}
              disabled={savingTarget}
            >
              Batal
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
