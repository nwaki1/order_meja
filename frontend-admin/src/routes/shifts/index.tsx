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
import { listOutlets } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
import { listShifts } from '#/lib/shifts.ts'
import type { Shift, ShiftListParams } from '#/lib/shifts.ts'

export const Route = createFileRoute('/shifts/')({
  component: ShiftsPage,
})

const PAGE_SIZE = 20

function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

const STATUS_CLASS: Record<string, string> = {
  open: 'border-primary/30 bg-primary/10 text-primary',
  draft: 'border-amber-400/40 bg-amber-400/10 text-amber-600',
  closed: 'border-border bg-muted text-muted-foreground',
  cancelled: 'border-destructive/30 bg-destructive/10 text-destructive',
}

function ShiftsPage() {
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canCreate = hasPermission('shifts:create')

  const [outlets, setOutlets] = React.useState<Outlet[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [pageIndex, setPageIndex] = React.useState(0)
  const [outletFilter, setOutletFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [dateFilter, setDateFilter] = React.useState('')

  React.useEffect(() => {
    if (!accessToken) return
    listOutlets(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setOutlets(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
  }, [accessToken])

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const params: ShiftListParams = {
      $top: PAGE_SIZE,
      $skip: pageIndex * PAGE_SIZE,
      $count: true,
    }
    if (outletFilter !== 'all') params.outlet_id = outletFilter
    if (statusFilter !== 'all') params.status = statusFilter
    if (dateFilter) params.work_date = dateFilter

    listShifts(accessToken, params)
      .then((res) => {
        if (!cancelled) {
          setShifts(res.value ?? [])
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
  }, [accessToken, pageIndex, outletFilter, statusFilter, dateFilter])

  const pageCount = Math.ceil(totalCount / PAGE_SIZE) || 1

  function clearFilters() {
    setOutletFilter('all')
    setStatusFilter('all')
    setDateFilter('')
    setPageIndex(0)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Shifts
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
        {canCreate && (
          <Button size="sm" variant="bright" asChild>
            <Link to="/shifts/new">
              <Plus />
              Buat Shift
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Outlet</Label>
          <Select
            value={outletFilter}
            onValueChange={(v) => {
              setOutletFilter(v)
              setPageIndex(0)
            }}
          >
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
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Tanggal</Label>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value)
              setPageIndex(0)
            }}
            className="w-40"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X />
          Reset
        </Button>
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
                Tanggal
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Shift
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Outlet
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Jam
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Worker
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
                  colSpan={7}
                  className="px-4 py-10 text-center text-destructive"
                >
                  {error}
                </td>
              </tr>
            ) : loading && shifts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat data...
                </td>
              </tr>
            ) : shifts.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Tidak ada shift.
                </td>
              </tr>
            ) : (
              shifts.map((s) => (
                <tr
                  key={s.id}
                  className="bg-background transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-[var(--sea-ink)]">
                    {s.work_date}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                    {s.name_snapshot}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {s.outlet_name}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {hhmm(s.start_time_snapshot)} - {hhmm(s.end_time_snapshot)}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {s.worker_count}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[s.status] ?? STATUS_CLASS.closed}`}
                    >
                      {s.status}
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
                        <Link to="/shifts/$shiftId" params={{ shiftId: s.id }}>
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
        <span>{totalCount} shift</span>
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
