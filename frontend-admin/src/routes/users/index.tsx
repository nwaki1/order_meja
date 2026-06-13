import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, ChevronsUpDown, Eye, Plus, Trash2, X } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { deleteUser, listUsers } from '#/lib/users.ts'
import type { ODataParams, User } from '#/lib/users.ts'

export const Route = createFileRoute('/users/')({
  component: UsersPage,
})

function UsersPage() {
  const { session, user: authUser, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canCreateUser = hasPermission('users:create')
  const canDeleteUser = hasPermission('users:delete')

  // ── Server data
  const [users, setUsers] = React.useState<User[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  // ── Table state (server-side)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  // ── Search: input immediate, query debounced
  const [searchInput, setSearchInput] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')

  function clearSearch() {
    setSearchInput('')
    setSearchQuery('')
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }

  React.useEffect(() => {
    const t = setTimeout(() => {
      setPagination((p) => ({ ...p, pageIndex: 0 }))
      setSearchQuery(searchInput)
    }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── Fetch
  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const odata: ODataParams = {
          $top: pagination.pageSize,
          $skip: pagination.pageIndex * pagination.pageSize,
          $count: true,
        }
        if (sorting[0]) {
          odata.$orderby = `${sorting[0].id} ${sorting[0].desc ? 'desc' : 'asc'}`
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim().replace(/'/g, "''")
          odata.$filter = `contains(name,'${q}') or contains(email,'${q}')`
        }
        const res = await listUsers(accessToken, odata)
        if (!cancelled) {
          const rows = Array.isArray(res) ? (res as unknown as User[]) : (res.value ?? [])
          setUsers(rows)
          setTotalCount((res as { '@odata.count'?: number })['@odata.count'] ?? rows.length)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Gagal memuat data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [accessToken, pagination, sorting, searchQuery, refreshKey])

  // ── Delete
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete(id: string) {
    if (!accessToken) return
    setDeleting(true)
    try {
      await deleteUser(accessToken, id)
      setConfirmDeleteId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menghapus user')
    } finally {
      setDeleting(false)
    }
  }

  // ── Columns
  const columns = React.useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Nama',
        cell: (info) => (
          <span className="font-medium text-[var(--sea-ink)]">
            {info.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: (info) => (
          <span className="text-[var(--sea-ink-soft)]">{info.getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: (info) => {
          const role = info.getValue<string>()
          return (
            <span
              className={
                role === 'admin'
                  ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                  : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
              }
            >
              {role}
            </span>
          )
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Bergabung',
        cell: (info) =>
          new Date(info.getValue<string>()).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original
          const isSelf = u.id === authUser?.id
          const isConfirming = confirmDeleteId === u.id

          return (
            <div className="flex items-center justify-end gap-1">
              {isConfirming ? (
                <>
                  <span className="mr-1 text-xs text-destructive">Hapus?</span>
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={() => handleDelete(u.id)}
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
                  <Button size="icon-sm" variant="ghost" title="Lihat detail" asChild>
                    <Link to="/users/$userId" params={{ userId: u.id }}>
                      <Eye />
                    </Link>
                  </Button>
                  {canDeleteUser && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={
                        isSelf ? 'Tidak bisa menghapus akun sendiri' : 'Hapus user'
                      }
                      disabled={isSelf}
                      onClick={() => setConfirmDeleteId(u.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </>
              )}
            </div>
          )
        },
      },
    ],
    [canDeleteUser, confirmDeleteId, deleting, authUser?.id],
  )

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    pageCount: Math.ceil(totalCount / pagination.pageSize) || 1,
    manualPagination: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  })

  const pageCount = table.getPageCount()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Users</h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
        {canCreateUser && (
          <Button size="sm" asChild variant="bright">
            <Link to="/users/new">
              <Plus />
              Tambah User
            </Link>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs">
          <Input
            placeholder="Cari nama atau email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pr-9"
          />
          {searchInput && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
        {loading && (
          <span className="animate-pulse text-xs text-[var(--sea-ink-soft)]">Memuat...</span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-[var(--line)] bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="inline-flex items-center gap-1 transition-colors hover:text-[var(--sea-ink)]"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp className="size-3" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {error ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-destructive">
                  {error}{' '}
                  <button className="underline" onClick={() => setRefreshKey((k) => k + 1)}>
                    Coba lagi
                  </button>
                </td>
              </tr>
            ) : loading && users.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat data...
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Tidak ada user ditemukan.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="bg-background transition-colors hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--sea-ink-soft)]">
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage() || loading}
          >
            «
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage() || loading}
          >
            ‹
          </Button>
          <span className="px-2">
            Hal {pagination.pageIndex + 1} / {pageCount}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage() || loading}
          >
            ›
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage() || loading}
          >
            »
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span>{totalCount} user</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(v) => setPagination({ pageIndex: 0, pageSize: Number(v) })}
          >
            <SelectTrigger size="sm" className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / hal
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
