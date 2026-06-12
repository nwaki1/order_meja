import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { PermissionForm } from '#/components/permission-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { deletePermission, getPermission } from '#/lib/permissions.ts'
import type { Permission } from '#/lib/permissions.ts'

export const Route = createFileRoute('/permissions/$permissionName/')({
  component: PermissionDetailPage,
})

function PermissionDetailPage() {
  const { permissionName } = Route.useParams()
  const router = useRouter()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canUpdatePermission = hasPermission('permissions:update')
  const canDeletePermission = hasPermission('permissions:delete')

  const [permission, setPermission] = React.useState<Permission | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

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

  async function handleDelete() {
    if (!accessToken || !permission) return
    setDeleting(true)
    try {
      await deletePermission(accessToken, permission.name)
      router.navigate({ to: '/permissions' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menghapus permission')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/permissions">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
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
          <Link to="/permissions">
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/permissions">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Permission
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canUpdatePermission && (
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/permissions/$permissionName/edit"
                params={{ permissionName: permission.name }}
              >
                <Pencil />
                Edit
              </Link>
            </Button>
          )}

          {canDeletePermission && (confirmDelete ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                <X />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              Hapus
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <PermissionForm mode="view" initialData={permission} />
      </div>
    </div>
  )
}
