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
import { getWorker, updateWorker } from '#/lib/workers.ts'
import type { Worker } from '#/lib/workers.ts'

export const Route = createFileRoute('/workers/$workerId/edit')({
  component: WorkerEditPage,
})

function WorkerEditPage() {
  const { workerId } = Route.useParams()
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [worker, setWorker] = React.useState<Worker | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getWorker(accessToken, workerId)
      .then((data) => {
        if (!cancelled) setWorker(data)
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
  }, [accessToken, workerId])

  async function handleSubmit(data: WorkerFormData) {
    if (!accessToken || !worker) return
    setFormError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const updated = await updateWorker(accessToken, worker.id, {
        code: data.code.trim(),
        name: data.name.trim(),
        phone: data.phone.trim() || undefined,
        email: data.email.trim() || undefined,
        is_active: data.is_active,
      })
      router.navigate({
        to: '/workers/$workerId',
        params: { workerId: updated.id },
      })
    } catch (e) {
      if (e instanceof ApiError) {
        setFormError(e.message)
        setFieldErrors(e.fieldErrors ?? {})
      } else {
        setFormError(e instanceof Error ? e.message : 'Terjadi kesalahan')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 w-full animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (loadError || !worker) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/workers/$workerId" params={{ workerId }}>
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Worker tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/workers/$workerId" params={{ workerId: worker.id }}>
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Edit Worker
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <WorkerForm
          mode="edit"
          initialData={worker}
          error={formError}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() =>
            router.navigate({
              to: '/workers/$workerId',
              params: { workerId: worker.id },
            })
          }
        />
      </div>
    </div>
  )
}
