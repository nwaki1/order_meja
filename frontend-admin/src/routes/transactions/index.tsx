import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Eye, X } from 'lucide-react'

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
import { listTransactions } from '#/lib/transactions.ts'
import type { Transaction, TransactionListParams } from '#/lib/transactions.ts'

export const Route = createFileRoute('/transactions/')({
  component: TransactionsPage,
})

function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

const PAGE_SIZE = 20

function TransactionsPage() {
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [outlets, setOutlets] = React.useState<Outlet[]>([])
  const [transactions, setTransactions] = React.useState<Transaction[]>([])
  const [totalCount, setTotalCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [pageIndex, setPageIndex] = React.useState(0)
  const [outletFilter, setOutletFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [searchInput, setSearchInput] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')

  React.useEffect(() => {
    if (!accessToken) return
    listOutlets(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setOutlets(Array.isArray(res) ? res : (res.value ?? [])))
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

    const params: TransactionListParams = {
      $top: PAGE_SIZE,
      $skip: pageIndex * PAGE_SIZE,
      $count: true,
      $orderby: 'transaction_at desc',
    }
    if (outletFilter !== 'all') params.outlet_id = outletFilter
    if (statusFilter !== 'all') params.status = statusFilter
    if (dateFrom) params.date_from = dateFrom
    if (dateTo) params.date_to = dateTo
    if (searchQuery.trim()) params.search = searchQuery.trim()

    listTransactions(accessToken, params)
      .then((res) => {
        if (!cancelled) {
          setTransactions(res.value ?? [])
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
  }, [
    accessToken,
    pageIndex,
    outletFilter,
    statusFilter,
    dateFrom,
    dateTo,
    searchQuery,
  ])

  const pageCount = Math.ceil(totalCount / PAGE_SIZE) || 1

  function clearFilters() {
    setOutletFilter('all')
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearchInput('')
    setSearchQuery('')
    setPageIndex(0)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
          Transaksi
        </h2>
        <div className="mt-1">
          <AdminBreadcrumbs />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">
            Cari Invoice
          </Label>
          <Input
            placeholder="INV-..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-48"
          />
        </div>
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
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Dari</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPageIndex(0)
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-[var(--sea-ink-soft)]">Sampai</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
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
                Invoice
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Outlet
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Kasir
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Waktu
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Total
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
            ) : loading && transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Memuat data...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-[var(--sea-ink-soft)]"
                >
                  Tidak ada transaksi.
                </td>
              </tr>
            ) : (
              transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="bg-background transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--sea-ink)]">
                    {tx.invoice_number}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {tx.outlet_name}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {tx.cashier_name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                    {new Date(tx.transaction_at).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                    {formatIDR(tx.total_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        tx.status === 'completed'
                          ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                          : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {tx.status}
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
                          to="/transactions/$transactionId"
                          params={{ transactionId: tx.id }}
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

      <div className="flex items-center justify-between text-sm text-[var(--sea-ink-soft)]">
        <span>{totalCount} transaksi</span>
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
