import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { Button } from '#/components/ui/button.tsx'
import { UserForm } from '#/components/user-form.tsx'
import type { UserFormData } from '#/components/user-form.tsx'
import { ApiError, type ApiFieldErrors } from '#/lib/api.ts'
import { createUser } from '#/lib/users.ts'

export const Route = createFileRoute('/users/new')({
  component: NewUserPage,
})

function NewUserPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [error, setError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<ApiFieldErrors>({})
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(data: UserFormData) {
    if (!accessToken) return
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      await createUser(accessToken, {
        name: data.name,
        email: data.email,
        role: data.role,
        password: data.password,
      })
      router.navigate({ to: '/users' })
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/users">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Tambah User</h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <UserForm
          mode="create"
          error={error}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/users' })}
        />
      </div>
    </div>
  )
}
