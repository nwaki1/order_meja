import React from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import { UserForm } from '#/components/user-form.tsx'
import type { UserFormData } from '#/components/user-form.tsx'
import { createUser } from '#/lib/users.ts'

export const Route = createFileRoute('/users/new')({
  component: NewUserPage,
})

function NewUserPage() {
  const router = useRouter()
  const { session } = useAuth()
  const accessToken = session?.accessToken

  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(data: UserFormData) {
    if (!accessToken) return
    setError(null)
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
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/users">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Tambah User</h2>
          <p className="text-sm text-[var(--sea-ink-soft)]">Buat akun pengguna baru</p>
        </div>
      </div>

      {/* Form card */}
      <div className="rounded-lg border border-[var(--line)] bg-background p-6">
        <UserForm
          mode="create"
          error={error}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => router.navigate({ to: '/users' })}
        />
      </div>
    </div>
  )
}
