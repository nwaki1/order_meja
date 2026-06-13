import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { WorkerForm } from '#/components/worker-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { listOutlets } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
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

          <div className="overflow-hidden rounded-lg border border-[var(--line)]">
            <table className="w-full text-sm">
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
    </div>
  )
}
