import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Trash2, UserPlus, X } from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { TenantForm } from '#/components/tenant-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import {
  assignTenantUser,
  deleteTenant,
  getTenant,
  listTenantUsers,
  revokeTenantUser,
} from '#/lib/tenants.ts'
import type { Tenant, TenantUser } from '#/lib/tenants.ts'
import { listUsers } from '#/lib/users.ts'
import type { User } from '#/lib/users.ts'

export const Route = createFileRoute('/tenants/$tenantId/')({
  component: TenantDetailPage,
})

function TenantDetailPage() {
  const { tenantId } = Route.useParams()
  const router = useRouter()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken
  const canUpdateTenant = hasPermission('tenants:update')
  const canDeleteTenant = hasPermission('tenants:delete')
  const canReadTenantUsers = hasPermission('tenant_users:read')
  const canAssignTenantUser =
    canReadTenantUsers &&
    hasPermission('tenant_users:assign') &&
    hasPermission('users:read')
  const canRevokeTenantUser =
    canReadTenantUsers && hasPermission('tenant_users:revoke')

  const [tenant, setTenant] = React.useState<Tenant | null>(null)
  const [tenantUsers, setTenantUsers] = React.useState<TenantUser[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [selectedUserId, setSelectedUserId] = React.useState('')
  const [assigning, setAssigning] = React.useState(false)
  const [revokeUserId, setRevokeUserId] = React.useState<string | null>(null)
  const [revoking, setRevoking] = React.useState(false)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    Promise.all([
      getTenant(accessToken, tenantId),
      canReadTenantUsers
        ? listTenantUsers(accessToken, tenantId)
        : Promise.resolve({ value: [] }),
      canAssignTenantUser
        ? listUsers(accessToken, {
            $top: 100,
            $skip: 0,
            $orderby: 'name asc',
          })
        : Promise.resolve({ value: [] }),
    ])
      .then(([tenantData, tenantUsersData, usersData]) => {
        if (!cancelled) {
          setTenant(tenantData)
          setTenantUsers(tenantUsersData.value ?? [])
          setUsers(Array.isArray(usersData) ? usersData : (usersData.value ?? []))
        }
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
  }, [
    accessToken,
    tenantId,
    refreshKey,
    canReadTenantUsers,
    canAssignTenantUser,
  ])

  async function handleDelete() {
    if (!accessToken || !tenant) return
    setDeleting(true)
    try {
      await deleteTenant(accessToken, tenant.id)
      router.navigate({ to: '/tenants' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan tenant')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleAssignUser() {
    if (!accessToken || !tenant || !selectedUserId) return
    setAssigning(true)
    try {
      await assignTenantUser(accessToken, tenant.id, selectedUserId)
      setSelectedUserId('')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menambahkan akses user')
    } finally {
      setAssigning(false)
    }
  }

  async function handleRevokeUser(userId: string) {
    if (!accessToken || !tenant) return
    setRevoking(true)
    try {
      await revokeTenantUser(accessToken, tenant.id, userId)
      setRevokeUserId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal mencabut akses user')
    } finally {
      setRevoking(false)
    }
  }

  const activeTenantUserIds = React.useMemo(
    () =>
      new Set(
        tenantUsers
          .filter((tenantUser) => tenantUser.is_active)
          .map((tenantUser) => tenantUser.user_id),
      ),
    [tenantUsers],
  )

  const availableUsers = users.filter((user) => !activeTenantUserIds.has(user.id))

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/tenants">
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

  if (loadError || !tenant) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/tenants">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Tenant tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/tenants">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Tenant
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canUpdateTenant && (
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/tenants/$tenantId/edit"
                params={{ tenantId: tenant.id }}
              >
                <Pencil />
                Edit
              </Link>
            </Button>
          )}

          {canDeleteTenant && (confirmDelete ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Menonaktifkan...' : 'Ya, Nonaktifkan'}
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
              Nonaktifkan
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <TenantForm mode="view" initialData={tenant} />
      </div>

      {canReadTenantUsers && (
      <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
              User Access
            </h3>
            <p className="text-xs text-[var(--sea-ink-soft)]">
              {tenantUsers.length} user terhubung ke tenant ini.
            </p>
          </div>
          {canAssignTenantUser && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
                disabled={assigning || availableUsers.length === 0}
              >
                <SelectTrigger size="sm" className="w-64 max-w-full">
                  <SelectValue placeholder="Pilih user" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} - {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleAssignUser}
                disabled={!selectedUserId || assigning}
              >
                <UserPlus />
                Tambah Akses
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--line)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--line)] bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Nama
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                  Status
                </th>
                {canRevokeTenantUser && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {tenantUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={canRevokeTenantUser ? 4 : 3}
                    className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                  >
                    Belum ada user access.
                  </td>
                </tr>
              ) : (
                tenantUsers.map((tenantUser) => {
                  const isConfirming = revokeUserId === tenantUser.user_id

                  return (
                    <tr
                      key={tenantUser.user_id}
                      className="bg-background transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                        {tenantUser.name}
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                        {tenantUser.email}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            tenantUser.is_active
                              ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                              : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                          }
                        >
                          {tenantUser.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      {canRevokeTenantUser && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isConfirming ? (
                            <>
                              <span className="mr-1 text-xs text-destructive">
                                Cabut?
                              </span>
                              <Button
                                size="xs"
                                variant="destructive"
                                onClick={() =>
                                  handleRevokeUser(tenantUser.user_id)
                                }
                                disabled={revoking}
                              >
                                Ya
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => setRevokeUserId(null)}
                                disabled={revoking}
                              >
                                Batal
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                setRevokeUserId(tenantUser.user_id)
                              }
                              disabled={!tenantUser.is_active}
                              className="text-destructive hover:text-destructive"
                            >
                              Cabut
                            </Button>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}
