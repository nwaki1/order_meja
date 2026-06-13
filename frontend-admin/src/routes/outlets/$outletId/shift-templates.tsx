import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet.tsx'
import { getOutlet } from '#/lib/outlets.ts'
import type { Outlet } from '#/lib/outlets.ts'
import {
  createShiftTemplate,
  deactivateShiftTemplate,
  listOutletShiftTemplates,
  updateShiftTemplate,
} from '#/lib/shifts.ts'
import type { ShiftTemplate } from '#/lib/shifts.ts'

export const Route = createFileRoute('/outlets/$outletId/shift-templates')({
  component: OutletShiftTemplatesPage,
})

function hhmm(t: string): string {
  return t.length >= 5 ? t.slice(0, 5) : t
}

function OutletShiftTemplatesPage() {
  const { outletId } = Route.useParams()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canCreate = hasPermission('shift_templates:create')
  const canUpdate = hasPermission('shift_templates:update')
  const canDelete = hasPermission('shift_templates:delete')

  const [outlet, setOutlet] = React.useState<Outlet | null>(null)
  const [templates, setTemplates] = React.useState<ShiftTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  // Drawer state (create or edit)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [fName, setFName] = React.useState('')
  const [fStart, setFStart] = React.useState('08:00')
  const [fEnd, setFEnd] = React.useState('16:00')
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null,
  )

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      getOutlet(accessToken, outletId),
      listOutletShiftTemplates(accessToken, outletId),
    ])
      .then(([o, t]) => {
        if (!cancelled) {
          setOutlet(o)
          setTemplates(t.value ?? [])
        }
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
  }, [accessToken, outletId, refreshKey])

  function openCreate() {
    setEditingId(null)
    setFName('')
    setFStart('08:00')
    setFEnd('16:00')
    setFormError(null)
    setDrawerOpen(true)
  }

  function openEdit(t: ShiftTemplate) {
    setEditingId(t.id)
    setFName(t.name)
    setFStart(hhmm(t.start_time))
    setFEnd(hhmm(t.end_time))
    setFormError(null)
    setDrawerOpen(true)
  }

  async function handleSubmit() {
    if (!accessToken) return
    if (!fName.trim()) {
      setFormError('Nama template wajib diisi')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      if (editingId) {
        await updateShiftTemplate(accessToken, editingId, {
          name: fName.trim(),
          start_time: fStart,
          end_time: fEnd,
        })
      } else {
        await createShiftTemplate(accessToken, outletId, {
          name: fName.trim(),
          start_time: fStart,
          end_time: fEnd,
        })
      }
      setDrawerOpen(false)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Gagal menyimpan template')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!accessToken) return
    try {
      await deactivateShiftTemplate(accessToken, id)
      setConfirmDeleteId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan template')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/outlets/$outletId" params={{ outletId }}>
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Template Shift
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>
        {canCreate && (
          <Button size="sm" variant="bright" onClick={openCreate}>
            <Plus />
            Tambah Template
          </Button>
        )}
      </div>

      {outlet && (
        <div className="rounded-lg border border-[var(--line)] bg-background p-4">
          <p className="text-sm font-semibold text-[var(--sea-ink)]">
            {outlet.name}{' '}
            <span className="text-xs font-normal text-[var(--sea-ink-soft)]">
              ({outlet.code})
            </span>
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--line)] bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Nama
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Mulai
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Selesai
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Status
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {loadError ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-destructive"
                >
                  {loadError}
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat data...
                </td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Belum ada template shift.
                </td>
              </tr>
            ) : (
              templates.map((t) => {
                const isConfirming = confirmDeleteId === t.id
                return (
                  <tr key={t.id} className="bg-background">
                    <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                      {t.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                      {hhmm(t.start_time)}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                      {hhmm(t.end_time)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          t.is_active
                            ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                            : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                        }
                      >
                        {t.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {isConfirming ? (
                          <>
                            <span className="mr-1 text-xs text-destructive">
                              Nonaktifkan?
                            </span>
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => handleDelete(t.id)}
                            >
                              Ya
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Batal
                            </Button>
                          </>
                        ) : (
                          <>
                            {canUpdate && (
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => openEdit(t)}
                              >
                                <Pencil />
                                Edit
                              </Button>
                            )}
                            {canDelete && t.is_active && (
                              <Button
                                size="xs"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setConfirmDeleteId(t.id)}
                              >
                                Nonaktifkan
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editingId ? 'Edit Template Shift' : 'Tambah Template Shift'}
            </SheetTitle>
            <SheetDescription>
              Shift lintas hari didukung (mis. 22:00 - 06:00).
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label htmlFor="st-name">Nama</Label>
              <Input
                id="st-name"
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="Pagi / Malam"
                disabled={submitting}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="st-start">Jam Mulai</Label>
                <Input
                  id="st-start"
                  type="time"
                  value={fStart}
                  onChange={(e) => setFStart(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-end">Jam Selesai</Label>
                <Input
                  id="st-end"
                  type="time"
                  value={fEnd}
                  onChange={(e) => setFEnd(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
            {formError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {formError}
              </p>
            )}
          </div>

          <SheetFooter>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDrawerOpen(false)}
              disabled={submitting}
            >
              Batal
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
