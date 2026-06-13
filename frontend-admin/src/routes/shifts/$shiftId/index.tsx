import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Ban, DoorOpen, Lock, Plus, X } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
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
import { listOutletWorkers } from '#/lib/workers.ts'
import type { WorkerOutlet } from '#/lib/workers.ts'

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

  const [shift, setShift] = React.useState<Shift | null>(null)
  const [workers, setWorkers] = React.useState<ShiftWorker[]>([])
  const [outletWorkers, setOutletWorkers] = React.useState<WorkerOutlet[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [selectedWorker, setSelectedWorker] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

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
        const [workersRes, outletWorkersRes] = await Promise.all([
          listShiftWorkers(accessToken as string, shiftId),
          canManageWorkers
            ? listOutletWorkers(accessToken as string, shiftData.outlet_id)
            : Promise.resolve({ value: [] as WorkerOutlet[] }),
        ])
        if (cancelled) return
        setWorkers(workersRes.value ?? [])
        setOutletWorkers(
          (outletWorkersRes.value ?? []).filter((w) => w.is_active),
        )
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
    </div>
  )
}
