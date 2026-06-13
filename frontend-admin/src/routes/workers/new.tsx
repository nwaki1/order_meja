import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { WorkerForm } from '#/components/worker-form.tsx'
import type { WorkerFormData } from '#/components/worker-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { ApiError } from '#/lib/api.ts'
import type { ApiFieldErrors } from '#/lib/api.ts'
import { listTenants } from '#/lib/tenants.ts'
import type { Tenant } from '#/lib/tenants.ts'
import { createWorker } from '#/lib/workers.ts'

export const Route = createFileRoute('/workers/new')({
  component: NewWorkerPage,
})

function NewWorkerPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    listTenants(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => setTenants(Array.isArray(res) ? res : (res.value ?? [])))
      .catch(() => {})
  }, [accessToken])

  async function handleSubmit(data: WorkerFormData) {
    if (!accessToken) return
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const worker = await createWorker(accessToken, {
        tenant_id: data.tenant_id,
        code: data.code.trim(),
        name: data.name.trim(),
        phone: data.phone.trim() || undefined,
        email: data.email.trim() || undefined,
      })
      router.navigate({
        to: '/workers/$workerId',
        params: { workerId: worker.id },
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
          <Link to="/workers">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Tambah Worker
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <WorkerForm
          mode="create"
          tenants={tenants}
          error={error}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/workers' })}
        />
      </div>
    </div>
  )
}
