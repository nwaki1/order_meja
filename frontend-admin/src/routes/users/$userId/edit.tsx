import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { AdminBreadcrumbs } from '#/components/admin-breadcrumbs.tsx'
import { Button } from '#/components/ui/button.tsx'
import { UserForm } from '#/components/user-form.tsx'
import type { UserFormData } from '#/components/user-form.tsx'
import { getUser, updateUser } from '#/lib/users.ts'
import type { User } from '#/lib/users.ts'

export const Route = createFileRoute('/users/$userId/edit')({
  component: UserEditPage,
})

function UserEditPage() {
  const { userId } = Route.useParams()
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [user, setUser] = React.useState<User | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

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

  async function handleSubmit(data: UserFormData) {
    if (!accessToken || !user) return
    setFormError(null)
    setSubmitting(true)
    try {
      const payload: Record<string, string> = {
        name: data.name,
        email: data.email,
        role: data.role,
      }
      if (data.password) payload.password = data.password
      await updateUser(accessToken, user.id, payload)
      router.navigate({ to: '/users/$userId', params: { userId: user.id } })
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
            <Link to="/users/$userId" params={{ userId }}>
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

  if (loadError || !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/users/$userId" params={{ userId }}>
            <ArrowLeft />
          </Link>
        </Button>
        <p className="text-sm text-destructive">{loadError ?? 'User tidak ditemukan.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/users/$userId" params={{ userId: user.id }}>
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Edit User</h2>
          <div className="mt-1">
            <AdminBreadcrumbs />
          </div>
        </div>
      </div>

      {/* Form — edit mode */}
      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <UserForm
          mode="edit"
          initialData={user}
          error={formError}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() =>
            router.navigate({ to: '/users/$userId', params: { userId: user.id } })
          }
        />
      </div>
    </div>
  )
}
