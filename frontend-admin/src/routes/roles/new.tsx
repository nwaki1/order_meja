import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { RoleForm } from '#/components/role-form.tsx'
import type { RoleFormData } from '#/components/role-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { createRole } from '#/lib/roles.ts'

export const Route = createFileRoute('/roles/new')({
  component: NewRolePage,
})

function NewRolePage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(data: RoleFormData) {
    if (!accessToken) return
    setError(null)
    setSubmitting(true)
    try {
      await createRole(accessToken, {
        name: data.name,
        description: data.description,
      })
      router.navigate({ to: '/roles' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/roles">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Tambah Role</h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <RoleForm
          mode="create"
          error={error}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/roles' })}
        />
      </div>
    </div>
  )
}
