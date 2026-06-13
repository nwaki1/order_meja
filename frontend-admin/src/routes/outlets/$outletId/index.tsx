import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  Pencil,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'

import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { useAuth } from '#/components/auth-provider.tsx'
import { OutletForm } from '#/components/outlet-form.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import {
  assignOutletUser,
  deactivateOutlet,
  getOutlet,
  listOutletOwnerships,
  listOutletUsers,
  revokeOutletUser,
  transferOutlet,
} from '#/lib/outlets.ts'
import type { Outlet, OutletOwnership, OutletUser } from '#/lib/outlets.ts'
import { listTenants } from '#/lib/tenants.ts'
import type { Tenant } from '#/lib/tenants.ts'
import { listUsers } from '#/lib/users.ts'
import type { User } from '#/lib/users.ts'

export const Route = createFileRoute('/outlets/$outletId/')({
  component: OutletDetailPage,
})

function OutletDetailPage() {
  const { outletId } = Route.useParams()
  const router = useRouter()
  const { session, hasPermission } = useAuth()
  const accessToken = session?.accessToken

  const canUpdateOutlet = hasPermission('outlets:update')
  const canDeleteOutlet = hasPermission('outlets:delete')
  const canReadOwnerships = hasPermission('outlet_ownerships:read')
  const canTransferOutlet =
    canReadOwnerships && hasPermission('outlet_ownerships:transfer')
  const canReadOutletUsers = hasPermission('outlet_users:read')
  const canAssignOutletUser =
    canReadOutletUsers &&
    hasPermission('outlet_users:assign') &&
    hasPermission('users:read')
  const canRevokeOutletUser =
    canReadOutletUsers && hasPermission('outlet_users:revoke')

  const [outlet, setOutlet] = React.useState<Outlet | null>(null)
  const [ownerships, setOwnerships] = React.useState<OutletOwnership[]>([])
  const [outletUsers, setOutletUsers] = React.useState<OutletUser[]>([])
  const [allUsers, setAllUsers] = React.useState<User[]>([])
  const [tenants, setTenants] = React.useState<Tenant[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshKey, setRefreshKey] = React.useState(0)

  const [showTransferUI, setShowTransferUI] = React.useState(false)
  const [transferTargetId, setTransferTargetId] = React.useState('')
  const [transferring, setTransferring] = React.useState(false)

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
      getOutlet(accessToken, outletId),
      canReadOwnerships
        ? listOutletOwnerships(accessToken, outletId)
        : Promise.resolve({ value: [] as OutletOwnership[] }),
      canReadOutletUsers
        ? listOutletUsers(accessToken, outletId)
        : Promise.resolve({ value: [] as OutletUser[] }),
      canAssignOutletUser
        ? listUsers(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
        : Promise.resolve({ value: [] as User[] }),
      canTransferOutlet
        ? listTenants(accessToken, {
            $top: 100,
            $skip: 0,
            $orderby: 'name asc',
          })
        : Promise.resolve({ value: [] as Tenant[] }),
    ])
      .then(
        ([
          outletData,
          ownershipsData,
          usersData,
          allUsersData,
          tenantsData,
        ]) => {
          if (!cancelled) {
            setOutlet(outletData)
            setOwnerships(ownershipsData.value ?? [])
            setOutletUsers(usersData.value ?? [])
            setAllUsers(
              Array.isArray(allUsersData)
                ? allUsersData
                : (allUsersData.value ?? []),
            )
            setTenants(
              Array.isArray(tenantsData)
                ? tenantsData
                : (tenantsData.value ?? []),
            )
          }
        },
      )
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
    outletId,
    refreshKey,
    canReadOwnerships,
    canReadOutletUsers,
    canAssignOutletUser,
    canTransferOutlet,
  ])

  async function handleDelete() {
    if (!accessToken || !outlet) return
    setDeleting(true)
    try {
      await deactivateOutlet(accessToken, outlet.id)
      router.navigate({ to: '/outlets' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menonaktifkan outlet')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleTransfer() {
    if (!accessToken || !outlet || !transferTargetId) return
    setTransferring(true)
    try {
      await transferOutlet(accessToken, outlet.id, transferTargetId)
      setShowTransferUI(false)
      setTransferTargetId('')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal mentransfer outlet')
    } finally {
      setTransferring(false)
    }
  }

  async function handleAssignUser() {
    if (!accessToken || !outlet || !selectedUserId) return
    setAssigning(true)
    try {
      await assignOutletUser(accessToken, outlet.id, selectedUserId)
      setSelectedUserId('')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menambahkan akses user')
    } finally {
      setAssigning(false)
    }
  }

  async function handleRevokeUser(userId: string) {
    if (!accessToken || !outlet) return
    setRevoking(true)
    try {
      await revokeOutletUser(accessToken, outlet.id, userId)
      setRevokeUserId(null)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal mencabut akses user')
    } finally {
      setRevoking(false)
    }
  }

  const activeOutletUserIds = React.useMemo(
    () => new Set(outletUsers.filter((u) => u.is_active).map((u) => u.user_id)),
    [outletUsers],
  )

  const availableUsers = allUsers.filter((u) => !activeOutletUserIds.has(u.id))

  const availableTenants = tenants.filter(
    (t) => t.is_active && t.id !== outlet?.current_tenant_id,
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/outlets">
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

  if (loadError || !outlet) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/outlets">
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">
          {loadError ?? 'Outlet tidak ditemukan.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/outlets">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
              Detail Outlet
            </h2>
            <div className="mt-1">
              <AdminBreadcrumbs />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link
              to="/outlets/$outletId/catalog"
              params={{ outletId: outlet.id }}
            >
              <BookOpen />
              Katalog
            </Link>
          </Button>

          {canUpdateOutlet && (
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/outlets/$outletId/edit"
                params={{ outletId: outlet.id }}
              >
                <Pencil />
                Edit
              </Link>
            </Button>
          )}

          {canDeleteOutlet &&
            (confirmDelete ? (
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
        <OutletForm mode="view" initialData={outlet} />
      </div>

      {canReadOwnerships && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
                Histori Ownership
              </h3>
              <p className="text-xs text-[var(--sea-ink-soft)]">
                {ownerships.length} record kepemilikan outlet.
              </p>
            </div>

            {canTransferOutlet && (
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                {showTransferUI ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={transferTargetId}
                        onValueChange={setTransferTargetId}
                        disabled={transferring || availableTenants.length === 0}
                      >
                        <SelectTrigger size="sm" className="w-64 max-w-full">
                          <SelectValue placeholder="Pilih tenant tujuan" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTenants.map((tenant) => (
                            <SelectItem key={tenant.id} value={tenant.id}>
                              {tenant.name} ({tenant.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleTransfer}
                        disabled={!transferTargetId || transferring}
                      >
                        {transferring
                          ? 'Mentransfer...'
                          : 'Konfirmasi Transfer'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowTransferUI(false)
                          setTransferTargetId('')
                        }}
                        disabled={transferring}
                      >
                        Batal
                      </Button>
                    </div>
                    <p className="text-xs text-destructive">
                      Perhatian: semua assignment user outlet akan dinonaktifkan
                      setelah transfer.
                    </p>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowTransferUI(true)}
                  >
                    <ArrowRightLeft />
                    Transfer Outlet
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--line)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--line)] bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Kode Tenant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Nama Tenant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Sejak
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Sampai
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {ownerships.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                    >
                      Belum ada histori ownership.
                    </td>
                  </tr>
                ) : (
                  ownerships.map((ownership) => (
                    <tr
                      key={ownership.id}
                      className="bg-background transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-semibold text-[var(--sea-ink)]">
                        {ownership.tenant_code}
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink)]">
                        {ownership.tenant_name}
                      </td>
                      <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                        {new Date(ownership.valid_from).toLocaleDateString(
                          'id-ID',
                          { day: 'numeric', month: 'short', year: 'numeric' },
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ownership.valid_until ? (
                          <span className="text-[var(--sea-ink-soft)]">
                            {new Date(ownership.valid_until).toLocaleDateString(
                              'id-ID',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              },
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            Aktif
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canReadOutletUsers && (
        <div className="space-y-4 rounded-lg border border-[var(--line)] bg-background p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
                User Outlet
              </h3>
              <p className="text-xs text-[var(--sea-ink-soft)]">
                {outletUsers.length} user terhubung ke outlet ini.
              </p>
            </div>
            {canAssignOutletUser && (
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
                    Diperbarui
                  </th>
                  {canRevokeOutletUser && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {outletUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canRevokeOutletUser ? 5 : 4}
                      className="px-4 py-8 text-center text-[var(--sea-ink-soft)]"
                    >
                      Belum ada user access.
                    </td>
                  </tr>
                ) : (
                  outletUsers.map((outletUser) => {
                    const isConfirming = revokeUserId === outletUser.user_id

                    return (
                      <tr
                        key={outletUser.user_id}
                        className="bg-background transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 font-medium text-[var(--sea-ink)]">
                          {outletUser.name}
                        </td>
                        <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                          {outletUser.email}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              outletUser.is_active
                                ? 'inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary'
                                : 'inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
                            }
                          >
                            {outletUser.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--sea-ink-soft)]">
                          {new Date(outletUser.updated_at).toLocaleDateString(
                            'id-ID',
                            {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            },
                          )}
                        </td>
                        {canRevokeOutletUser && (
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
                                      handleRevokeUser(outletUser.user_id)
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
                                    setRevokeUserId(outletUser.user_id)
                                  }
                                  disabled={!outletUser.is_active}
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
