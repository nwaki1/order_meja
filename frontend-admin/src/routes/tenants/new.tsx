import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { TenantForm } from '#/components/tenant-form.tsx'
import type { TenantFormData } from '#/components/tenant-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { ApiError } from '#/lib/api.ts'
import type { ApiFieldErrors } from '#/lib/api.ts'
import { createTenant } from '#/lib/tenants.ts'

export const Route = createFileRoute('/tenants/new')({
  component: NewTenantPage,
})

function NewTenantPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(data: TenantFormData) {
    if (!accessToken) return
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const tenant = await createTenant(accessToken, {
        code: data.code,
        name: data.name,
      })
      router.navigate({
        to: '/tenants/$tenantId',
        params: { tenantId: tenant.id },
      })
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message)
        setFieldErrors(e.fieldErrors ?? {})
      } else {
        setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/tenants">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Tambah Tenant
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <TenantForm
          mode="create"
          error={error}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/tenants' })}
        />
      </div>
    </div>
  )
}
