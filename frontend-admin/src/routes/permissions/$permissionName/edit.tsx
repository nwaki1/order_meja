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
import { getPermission, updatePermission } from '#/lib/permissions.ts'
import type { Permission } from '#/lib/permissions.ts'

export const Route = createFileRoute('/permissions/$permissionName/edit')({
  component: PermissionEditPage,
})

function PermissionEditPage() {
  const { permissionName } = Route.useParams()
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [permission, setPermission] = React.useState<Permission | null>(null)
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

    getPermission(accessToken, permissionName)
      .then((data) => {
        if (!cancelled) setPermission(data)
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Gagal memuat data')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, permissionName])

  async function handleSubmit(data: PermissionFormData) {
    if (!accessToken || !permission) return
    setFormError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const updated = await updatePermission(accessToken, permission.name, {
        name: data.name,
        description: data.description,
      })
      router.navigate({
        to: '/permissions/$permissionName',
        params: { permissionName: updated.name },
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
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/permissions/$permissionName" params={{ permissionName }}>
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

  if (loadError || !permission) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/permissions/$permissionName" params={{ permissionName }}>
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Permission tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link
            to="/permissions/$permissionName"
            params={{ permissionName: permission.name }}
          >
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
            Edit Permission
          </h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <PermissionForm
          mode="edit"
          initialData={permission}
          error={formError}
          fieldErrors={fieldErrors}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() =>
            router.navigate({
              to: '/permissions/$permissionName',
              params: { permissionName: permission.name },
            })
          }
        />
      </div>
    </div>
  )
}
