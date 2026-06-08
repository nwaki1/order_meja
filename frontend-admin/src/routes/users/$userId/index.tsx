import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import { UserForm } from '#/components/user-form.tsx'
import { deleteUser, getUser } from '#/lib/users.ts'
import type { User } from '#/lib/users.ts'
import { useRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/users/$userId/')({
  component: UserDetailPage,
})

function UserDetailPage() {
  const { userId } = Route.useParams()
  const router = useRouter()
  const { session, user: authUser } = useAuth()
  const accessToken = session?.accessToken

  const [user, setUser] = React.useState<User | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    getUser(accessToken, userId)
      .then((data) => { if (!cancelled) setUser(data) })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Gagal memuat data') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [accessToken, userId])

  async function handleDelete() {
    if (!accessToken || !user) return
    setDeleting(true)
    try {
      await deleteUser(accessToken, user.id)
      router.navigate({ to: '/users' })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Gagal menghapus user')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const isSelf = user?.id === authUser?.id

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/users"><ArrowLeft /></Link>
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

  if (loadError || !user) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/users"><ArrowLeft /></Link>
        </Button>
        <p className="text-sm text-destructive">{loadError ?? 'User tidak ditemukan.'}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/users"><ArrowLeft /></Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Detail User</h2>
            <p className="text-sm text-[var(--sea-ink-soft)]">{user.email}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/users/$userId/edit" params={{ userId: user.id }}>
              <Pencil />
              Edit
            </Link>
          </Button>

          {!isSelf && (
            confirmDelete ? (
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
            )
          )}
        </div>
      </div>

      {/* Form — view mode (all disabled) */}
      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <UserForm mode="view" initialData={user} />
      </div>
    </div>
  )
}
