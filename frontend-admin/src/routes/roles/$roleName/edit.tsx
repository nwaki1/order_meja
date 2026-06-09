import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { RoleForm } from '#/components/role-form.tsx'
import type { RoleFormData } from '#/components/role-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { getRole, updateRole } from '#/lib/roles.ts'
import type { Role } from '#/lib/roles.ts'

export const Route = createFileRoute('/roles/$roleName/edit')({
  component: RoleEditPage,
})

function RoleEditPage() {
  const { roleName } = Route.useParams()
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [role, setRole] = React.useState<Role | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    getRole(accessToken, roleName)
      .then((data) => {
        if (!cancelled) setRole(data)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Gagal memuat data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, roleName])

  async function handleSubmit(data: RoleFormData) {
    if (!accessToken || !role) return
    setFormError(null)
    setSubmitting(true)
    try {
      const updated = await updateRole(accessToken, role.name, {
        name: data.name,
        description: data.description,
      })
      router.navigate({ to: '/roles/$roleName', params: { roleName: updated.name } })
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/roles/$roleName" params={{ roleName }}>
              <ArrowLeft />
            </Link>
          </Button>
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loadError || !role) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/roles/$roleName" params={{ roleName }}>
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">{loadError ?? 'Role tidak ditemukan.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/roles/$roleName" params={{ roleName: role.name }}>
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Edit Role</h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <RoleForm
          mode="edit"
          initialData={role}
          error={formError}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/roles/$roleName', params: { roleName: role.name } })}
        />
      </div>
    </div>
  )
}
