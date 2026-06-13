import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Eye, Plus, Trash2, X } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { listTenants } from '#/lib/tenants.ts'
import type { Tenant } from '#/lib/tenants.ts'
import { deactivateWorker, listWorkers } from '#/lib/workers.ts'
import type { Worker, WorkerListParams } from '#/lib/workers.ts'

export const Route = createFileRoute('/workers/')({
  component: WorkersPage,
})

const PAGE_SIZE = 20

function WorkersPage() {
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canCreate = hasPermission('workers:create')
  const canDelete = hasPermission('workers:delete')

  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [workers, setWorkers] = React.useState<Worker[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [pageIndex, setPageIndex] = React.useState(0)
  const [tenantFilter, setTenantFilter] = React.useState('all')
  const [searchInput, setSearchInput] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')

  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null,
  )
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    listTenants(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setTenants(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
  }, [accessToken])

  React.useEffect(() => {
    const t = setTimeout(() => {
      setPageIndex(0)
      setSearchQuery(searchInput)
    }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setError(null)

    const params: WorkerListParams = {
      $top: PAGE_SIZE,
      $skip: pageIndex * PAGE_SIZE,
      $count: true,
    }
    if (tenantFilter !== 'all') params.tenant_id = tenantFilter
    if (searchQuery.trim()) params.search = searchQuery.trim()

    listWorkers(accessToken, params)
      .then((res) => {
        if (!cancelled) {
          setWorkers(res.value ?? [])
          setTotalCount(res['@odata.count'] ?? (res.value ?? []).length)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Gagal memuat data')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, pageIndex, tenantFilter, searchQuery, refreshKey])

  const pageCount = Math.ceil(totalCount / PAGE_SIZE) || 1

  async function handleDelete(id: string) {
    if (!accessToken) return
    setDeleting(true)
    try {
      await deactivateWorker(accessToken, id)
      setConfirmDeleteId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan worker')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Workers
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
        {canCreate && (
          <Button size="sm" asChild variant="bright">
            <Link to="/workers/new">
              <Plus />
              Tambah Worker
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs">
          <Input
            placeholder="Cari nama / kode / telp / email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pr-9"
          />
          {searchInput && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        <Select
          value={tenantFilter}
          onValueChange={(v) => {
            setTenantFilter(v)
            setPageIndex(0)
          }}
        >
          <SelectTrigger size="sm" className="w-48">
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
                Kode
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Nama
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Tenant
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Telepon
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
            ) : loading && workers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat data...
                </td>
              </tr>
            ) : workers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Tidak ada worker.
                </td>
              </tr>
            ) : (
              workers.map((w) => {
                const isConfirming = confirmDeleteId === w.id
                return (
                  <tr
                    key={w.id}
                    className="bg-background transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-semibold text-[var(--sea-ink)]">
                      {w.code}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink)]">
                      {w.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                      {w.tenant_name}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                      {w.phone ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          w.is_active
                            ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                            : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                        }
                      >
                        {w.is_active ? 'Aktif' : 'Nonaktif'}
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
                              onClick={() => handleDelete(w.id)}
                              disabled={deleting}
                            >
                              Ya
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deleting}
                            >
                              Batal
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              asChild
                              title="Detail"
                            >
                              <Link
                                to="/workers/$workerId"
                                params={{ workerId: w.id }}
                              >
                                <Eye />
                              </Link>
                            </Button>
                            {canDelete && w.is_active && (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                title="Nonaktifkan"
                                onClick={() => setConfirmDeleteId(w.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 />
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

      <div className="flex items-center justify-between text-sm text-[var(--sea-ink-soft)]">
        <span>{totalCount} worker</span>
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
