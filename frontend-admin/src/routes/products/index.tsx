import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from '@tanstack/react-table'
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Eye,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

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
import { deactivateProduct, listProducts } from '#/lib/products.ts'
import type { Product, ProductListParams } from '#/lib/products.ts'

export const Route = createFileRoute('/products/')({
  component: ProductsPage,
})

function ProductsPage() {
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canCreate = hasPermission('products:create')
  const canDelete = hasPermission('products:delete')

  const [products, setProducts] = React.useState<Product[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

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

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params: ProductListParams = {
          $top: pagination.pageSize,
          $skip: pagination.pageIndex * pagination.pageSize,
          $count: true,
        }
        if (sorting[0]) {
          params.$orderby = `${sorting[0].id} ${sorting[0].desc ? 'desc' : 'asc'}`
        }
        if (searchQuery.trim()) {
          params.search = searchQuery.trim()
        }
        const res = await listProducts(accessToken, params)
        if (!cancelled) {
          const rows = res.value ?? []
          setProducts(rows)
          setTotalCount(res['@odata.count'] ?? rows.length)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Gagal memuat data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accessToken, pagination, sorting, searchQuery, refreshKey])

  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null,
  )
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete(id: string) {
    if (!accessToken) return
    setDeleting(true)
    try {
      await deactivateProduct(accessToken, id)
      setConfirmDeleteId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan produk')
    } finally {
      setDeleting(false)
    }
  }

  const columns = React.useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: (info) => (
          <span className="font-semibold text-[var(--sea-ink)]">
            {info.getValue<string>()}
          </span>
        ),
      },
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
        id: 'category',
        header: 'Kategori',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-[var(--sea-ink-soft)]">
            {row.original.category_name ?? '-'}
          </span>
        ),
      },
      {
        id: 'tenant',
        header: 'Tenant',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-[var(--sea-ink-soft)]">
            {row.original.tenant_name}{' '}
            <span className="text-xs">({row.original.tenant_code})</span>
          </span>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: (info) => {
          const active = info.getValue<boolean>()
          return (
            <span
              className={
                active
                  ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                  : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
              }
            >
              {active ? 'Aktif' : 'Nonaktif'}
            </span>
          )
        },
      },
      {
        accessorKey: 'updated_at',
        header: 'Diperbarui',
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
          const product = row.original
          const isConfirming = confirmDeleteId === product.id

          return (
            <div className="flex items-center justify-end gap-1">
              {isConfirming ? (
                <>
                  <span className="mr-1 text-xs text-destructive">
                    Nonaktifkan?
                  </span>
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={() => handleDelete(product.id)}
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
                    title="Lihat detail"
                    asChild
                  >
                    <Link
                      to="/products/$productId"
                      params={{ productId: product.id }}
                    >
                      <Eye />
                    </Link>
                  </Button>
                  {canDelete && product.is_active && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Nonaktifkan produk"
                      onClick={() => setConfirmDeleteId(product.id)}
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
    [canDelete, confirmDeleteId, deleting],
  )

  const table = useReactTable({
    data: products,
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Produk
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
        {canCreate && (
          <Button size="sm" asChild variant="bright">
            <Link to="/products/new">
              <Plus />
              Tambah Produk
            </Link>
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-xs">
          <Input
            placeholder="Cari SKU atau nama..."
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
          <span className="animate-pulse text-xs text-[var(--sea-ink-soft)]">
            Memuat...
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)]">
        <table className="w-full text-sm">
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
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp className="size-3" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {error ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-destructive"
                >
                  {error}{' '}
                  <button
                    className="underline"
                    onClick={() => setRefreshKey((k) => k + 1)}
                  >
                    Coba lagi
                  </button>
                </td>
              </tr>
            ) : loading && products.length === 0 ? (
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
                  Tidak ada produk ditemukan.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="bg-background transition-colors hover:bg-muted/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--sea-ink-soft)]">
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage() || loading}
          >
            {'<<'}
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage() || loading}
          >
            {'<'}
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
            {'>'}
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage() || loading}
          >
            {'>>'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span>{totalCount} produk</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(v) =>
              setPagination({ pageIndex: 0, pageSize: Number(v) })
            }
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
