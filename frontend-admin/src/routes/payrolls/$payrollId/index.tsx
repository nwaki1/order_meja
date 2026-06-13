import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Plus, X } from 'lucide-react'

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
import { addPayrollItem, deletePayrollItem, getPayroll } from '#/lib/payroll.ts'
import type { PayrollDetail } from '#/lib/payroll.ts'
import { MONTH_NAMES, formatIDR } from '#/routes/payroll-periods/index.tsx'

export const Route = createFileRoute('/payrolls/$payrollId/')({
  component: PayrollDetailPage,
})

const ITEM_TYPE_LABELS: Record<string, string> = {
  base_salary: 'Gaji Pokok',
  incentive: 'Insentif',
  adjustment: 'Adjustment',
  deduction: 'Potongan',
}

function PayrollDetailPage() {
  const { payrollId } = Route.useParams()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canManageItems = hasPermission('payroll_items:manage')

  const [payroll, setPayroll] = React.useState<PayrollDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [itemType, setItemType] = React.useState<'adjustment' | 'deduction'>(
    'adjustment',
  )
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [itemError, setItemError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getPayroll(accessToken, payrollId)
      .then((data) => {
        if (!cancelled) setPayroll(data)
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
  }, [accessToken, payrollId, refreshKey])

  async function handleAddItem() {
    if (!accessToken) return
    const value = Math.round(Number(amount) || 0)
    if (!description.trim()) {
      setItemError('Deskripsi wajib diisi')
      return
    }
    if (value < 0) {
      setItemError('Amount tidak boleh negatif')
      return
    }
    setBusy(true)
    setItemError(null)
    try {
      await addPayrollItem(accessToken, payrollId, {
        item_type: itemType,
        description: description.trim(),
        amount: value,
      })
      setDescription('')
      setAmount('')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setItemError(e instanceof Error ? e.message : 'Gagal menambah item')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!accessToken) return
    setBusy(true)
    setItemError(null)
    try {
      await deletePayrollItem(accessToken, payrollId, itemId)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setItemError(e instanceof Error ? e.message : 'Gagal menghapus item')
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

  if (loadError || !payroll) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/payroll-periods">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Payroll tidak ditemukan.'}
        </p>
      </div>
    )
  }

  const isDraft = payroll.status === 'draft'
  const canEdit = canManageItems && isDraft

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link
            to="/payroll-periods/$periodId"
            params={{ periodId: payroll.payroll_period_id }}
          >
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Slip Payroll
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-[var(--line)] bg-background p-6 sm:grid-cols-3">
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Worker</p>
          <p className="font-semibold text-[var(--sea-ink)]">
            {payroll.worker_name}{' '}
            <span className="text-xs font-normal text-[var(--sea-ink-soft)]">
              ({payroll.worker_code})
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Periode</p>
          <p className="text-[var(--sea-ink)]">
            {MONTH_NAMES[payroll.month]} {payroll.year}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--sea-ink-soft)]">Status</p>
          <span
            className={
              payroll.status === 'finalized'
                ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                : 'inline-flex items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600'
            }
          >
            {payroll.status}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-[var(--line)] bg-background p-4">
          <div className="flex justify-between text-sm text-[var(--sea-ink-soft)]">
            <span>Gaji Pokok</span>
            <span>{formatIDR(payroll.base_salary)}</span>
          </div>
          <div className="flex justify-between text-sm text-[var(--sea-ink-soft)]">
            <span>Insentif</span>
            <span>{formatIDR(payroll.incentive_total)}</span>
          </div>
          <div className="flex justify-between text-sm text-[var(--sea-ink-soft)]">
            <span>Adjustment</span>
            <span>{formatIDR(payroll.adjustment_total)}</span>
          </div>
          <div className="flex justify-between text-sm text-[var(--sea-ink-soft)]">
            <span>Potongan</span>
            <span>-{formatIDR(payroll.deduction_total)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--line)] pt-2 text-base font-semibold text-[var(--sea-ink)]">
            <span>Grand Total</span>
            <span>{formatIDR(payroll.grand_total)}</span>
          </div>
        </div>

        {canEdit && (
          <div className="space-y-3 rounded-lg border border-[var(--line)] bg-background p-4">
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              Tambah Item Manual
            </h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-[var(--sea-ink-soft)]">
                  Tipe
                </Label>
                <Select
                  value={itemType}
                  onValueChange={(v) =>
                    setItemType(v as 'adjustment' | 'deduction')
                  }
                >
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjustment">Adjustment (+)</SelectItem>
                    <SelectItem value="deduction">Potongan (-)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--sea-ink-soft)]">
                  Amount
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-[var(--sea-ink-soft)]">
                Deskripsi
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Bonus manual / Potongan kasbon"
              />
            </div>
            {itemError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {itemError}
              </p>
            )}
            <Button
              size="sm"
              onClick={handleAddItem}
              disabled={busy || !amount || !description.trim()}
            >
              <Plus />
              Tambah Item
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-[var(--line)] bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Tipe
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Deskripsi
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Sumber
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                Amount
              </th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {payroll.items.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 5 : 4}
                  className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                >
                  Belum ada item.
                </td>
              </tr>
            ) : (
              payroll.items.map((item) => {
                const isDeduction = item.item_type === 'deduction'
                const isManual = item.source_type === 'manual'
                return (
                  <tr key={item.id} className="bg-background">
                    <td className="px-4 py-3 text-[var(--sea-ink)]">
                      {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}
                    </td>
                    <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                      {item.description}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--sea-ink-soft)]">
                      {item.source_type}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${isDeduction ? 'text-destructive' : 'text-[var(--sea-ink)]'}`}
                    >
                      {isDeduction ? '-' : ''}
                      {formatIDR(item.amount)}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {isManual && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteItem(item.id)}
                              disabled={busy}
                              title="Hapus item"
                            >
                              <X />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
