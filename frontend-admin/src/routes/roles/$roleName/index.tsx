import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { RoleForm } from '#/components/role-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import { deleteRole, getRole } from '#/lib/roles.ts'
import type { Role } from '#/lib/roles.ts'

export const Route = createFileRoute('/roles/$roleName/')({
  component: RoleDetailPage,
})

function RoleDetailPage() {
  const { roleName } = Route.useParams()
  const router = useRouter()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canUpdateRole =
    hasPermission('roles:update') &&
    hasPermission('roles:update_permissions') &&
    hasPermission('permissions:read')
  const canDeleteRole = hasPermission('roles:delete')

  const [role, setRole] = React.useState<Role | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

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
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : 'Gagal memuat data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [accessToken, roleName])

  async function handleDelete() {
    if (!accessToken || !role) return
    setDeleting(true)
    try {
      await deleteRole(accessToken, role.name)
      router.navigate({ to: '/roles' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menghapus role')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/roles">
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

  if (loadError || !role) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/roles">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Role tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/roles">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Role
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canUpdateRole && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/roles/$roleName/edit" params={{ roleName: role.name }}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}

          {canDeleteRole && (confirmDelete ? (
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
        <RoleForm mode="view" initialData={role} />
      </div>
    </div>
  )
}
