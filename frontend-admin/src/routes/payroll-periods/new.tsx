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
import { listTenants } from '#/lib/tenants.ts'
import type { Tenant } from '#/lib/tenants.ts'
import { createPayrollPeriod } from '#/lib/payroll.ts'
import { MONTH_NAMES } from '#/routes/payroll-periods/index.tsx'

export const Route = createFileRoute('/payroll-periods/new')({
  component: NewPayrollPeriodPage,
})

function NewPayrollPeriodPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const now = new Date()
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [tenantId, setTenantId] = React.useState('')
  const [year, setYear] = React.useState(String(now.getFullYear()))
  const [month, setMonth] = React.useState(String(now.getMonth() + 1))

  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    listTenants(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setTenants(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
  }, [accessToken])

  async function handleSubmit() {
    if (!accessToken || !tenantId) return
    setError(null)
    setSubmitting(true)
    try {
      const period = await createPayrollPeriod(accessToken, {
        tenant_id: tenantId,
        year: Number(year),
        month: Number(month),
      })
      router.navigate({
        to: '/payroll-periods/$periodId',
        params: { periodId: period.id },
      })
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError(e instanceof Error ? e.message : 'Gagal membuat period')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/payroll-periods">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Buat Payroll Period
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
              Tenant<span className="ml-0.5 font-bold text-destructive">*</span>
            </span>
          </Label>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pilih tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants
                .filter((t) => t.is_active)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pp-year">Tahun</Label>
          <Input
            id="pp-year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Bulan</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {MONTH_NAMES[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3 pt-2 md:col-span-2">
          <Button
            variant="outline"
            onClick={() => router.navigate({ to: '/payroll-periods' })}
            disabled={submitting}
          >
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !tenantId}>
            {submitting ? 'Membuat...' : 'Buat Period'}
          </Button>
        </div>
      </div>
    </div>
  )
}
