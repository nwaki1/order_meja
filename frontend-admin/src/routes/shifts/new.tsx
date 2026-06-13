import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

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
import { ApiError } from '#/lib/api.ts'
import { listOutlets } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
import { createShift, listOutletShiftTemplates } from '#/lib/shifts.ts'
import type { ShiftTemplate } from '#/lib/shifts.ts'
import { listOutletWorkers } from '#/lib/workers.ts'
import type { WorkerOutlet } from '#/lib/workers.ts'

export const Route = createFileRoute('/shifts/new')({
  component: NewShiftPage,
})

const NO_TEMPLATE = '__none__'

function NewShiftPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [outlets, setOutlets] = React.useState<Outlet[]>([])
  const [outletId, setOutletId] = React.useState('')
  const [templates, setTemplates] = React.useState<ShiftTemplate[]>([])
  const [outletWorkers, setOutletWorkers] = React.useState<WorkerOutlet[]>([])

  const [templateId, setTemplateId] = React.useState(NO_TEMPLATE)
  const [workDate, setWorkDate] = React.useState(
    new Date().toISOString().slice(0, 10),
  )
  const [name, setName] = React.useState('')
  const [startTime, setStartTime] = React.useState('08:00')
  const [endTime, setEndTime] = React.useState('16:00')
  const [selectedWorkers, setSelectedWorkers] = React.useState<Set<string>>(
    new Set(),
  )

  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    listOutlets(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setOutlets(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
  }, [accessToken])

  React.useEffect(() => {
    if (!accessToken || !outletId) {
      setTemplates([])
      setOutletWorkers([])
      return
    }
    let cancelled = false
    Promise.all([
      listOutletShiftTemplates(accessToken, outletId),
      listOutletWorkers(accessToken, outletId),
    ])
      .then(([t, w]) => {
        if (!cancelled) {
          setTemplates((t.value ?? []).filter((x) => x.is_active))
          setOutletWorkers((w.value ?? []).filter((x) => x.is_active))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [accessToken, outletId])

  const usingTemplate = templateId !== NO_TEMPLATE

  function toggleWorker(id: string) {
    setSelectedWorkers((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!accessToken || !outletId) return
    setError(null)
    setSubmitting(true)
    try {
      const shift = await createShift(accessToken, {
        outlet_id: outletId,
        shift_template_id: usingTemplate ? templateId : undefined,
        work_date: workDate,
        name: usingTemplate ? undefined : name.trim() || undefined,
        start_time: usingTemplate ? undefined : startTime,
        end_time: usingTemplate ? undefined : endTime,
        worker_ids: Array.from(selectedWorkers),
      })
      router.navigate({ to: '/shifts/$shiftId', params: { shiftId: shift.id } })
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(e instanceof Error ? e.message : 'Gagal membuat shift')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/shifts">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Buat Shift
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="grid gap-5 rounded-lg border border-[var(--line)] bg-background p-6 md:grid-cols-2">
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive md:col-span-2">
            {error}
          </p>
        )}

        <div className="space-y-1.5">
          <Label className="gap-1">
            <span>
              Outlet<span className="ml-0.5 font-bold text-destructive">*</span>
            </span>
          </Label>
          <Select
            value={outletId}
            onValueChange={(v) => {
              setOutletId(v)
              setTemplateId(NO_TEMPLATE)
              setSelectedWorkers(new Set())
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih outlet" />
            </SelectTrigger>
            <SelectContent>
              {outlets
                .filter((o) => o.is_active)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Template (opsional)</Label>
          <Select
            value={templateId}
            onValueChange={setTemplateId}
            disabled={!outletId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tanpa template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEMPLATE}>Tanpa template</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.start_time.slice(0, 5)}-{t.end_time.slice(0, 5)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sh-date" className="gap-1">
            <span>
              Tanggal
              <span className="ml-0.5 font-bold text-destructive">*</span>
            </span>
          </Label>
          <Input
            id="sh-date"
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
          />
        </div>

        {!usingTemplate && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="sh-name">Nama Shift</Label>
              <Input
                id="sh-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pagi"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-start">Jam Mulai</Label>
              <Input
                id="sh-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-end">Jam Selesai</Label>
              <Input
                id="sh-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="space-y-2 md:col-span-2">
          <Label>Worker (assignment outlet aktif)</Label>
          {!outletId ? (
            <p className="text-sm text-[var(--sea-ink-soft)]">
              Pilih outlet terlebih dahulu.
            </p>
          ) : outletWorkers.length === 0 ? (
            <p className="text-sm text-[var(--sea-ink-soft)]">
              Tidak ada worker dengan assignment aktif di outlet ini.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {outletWorkers.map((w) => {
                const selected = selectedWorkers.has(w.worker_id)
                return (
                  <button
                    key={w.worker_id}
                    type="button"
                    onClick={() => toggleWorker(w.worker_id)}
                    className={
                      selected
                        ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm font-medium text-primary'
                        : 'rounded-full border border-[var(--line)] px-3 py-1 text-sm text-[var(--sea-ink-soft)] hover:bg-muted/40'
                    }
                  >
                    {w.name} ({w.code})
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2 md:col-span-2">
          <Button
            variant="outline"
            onClick={() => router.navigate({ to: '/shifts' })}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !outletId}>
            {submitting ? 'Membuat...' : 'Buat Shift Draft'}
          </Button>
        </div>
      </div>
    </div>
  )
}
