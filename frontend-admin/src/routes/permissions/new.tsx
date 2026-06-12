import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { PermissionForm } from '#/components/permission-form.tsx'
import type { PermissionFormData } from '#/components/permission-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { ApiError } from '#/lib/api.ts'
import type { ApiFieldErrors } from '#/lib/api.ts'
import { createPermission } from '#/lib/permissions.ts'

export const Route = createFileRoute('/permissions/new')({
  component: NewPermissionPage,
})

function NewPermissionPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(data: PermissionFormData) {
    if (!accessToken) return
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      await createPermission(accessToken, {
        name: data.name,
        description: data.description,
      })
      router.navigate({ to: '/permissions' })
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
          <Link to="/permissions">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Tambah Permission
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <PermissionForm
          mode="create"
          error={error}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/permissions' })}
        />
      </div>
    </div>
  )
}
