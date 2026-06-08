import React from 'react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import type { User } from '#/lib/users.ts'

export type UserFormMode = 'create' | 'edit' | 'view'

export interface UserFormData {
  name: string
  email: string
  role: string
  password: string
}

interface UserFormProps {
  mode: UserFormMode
  initialData?: User | null
  error?: string | null
  submitting?: boolean
  onSubmit?: (data: UserFormData) => void
  onCancel?: () => void
}

export function UserForm({
  mode,
  initialData,
  error,
  submitting = false,
  onSubmit,
  onCancel,
}: UserFormProps) {
  const [form, setForm] = React.useState<UserFormData>({
    name: initialData?.name ?? '',
    email: initialData?.email ?? '',
    role: initialData?.role ?? 'user',
    password: '',
  })

  // Sync when initialData arrives (e.g. after fetch resolves)
  React.useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        email: initialData.email,
        role: initialData.role,
        password: '',
      })
    }
  }, [initialData?.id, mode])

  const disabled = mode === 'view' || submitting

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit?.(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="uf-name">Nama</Label>
        <Input
          id="uf-name"
          placeholder="John Doe"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={disabled}
          required={mode !== 'view'}
        />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="uf-email">Email</Label>
        <Input
          id="uf-email"
          type="email"
          placeholder="john@example.com"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          disabled={disabled}
          required={mode !== 'view'}
        />
      </div>

      {/* Role */}
      <div className="space-y-1.5">
        <Label htmlFor="uf-role">Role</Label>
        {mode === 'view' ? (
          <Input id="uf-role" value={form.role} disabled />
        ) : (
          <Select
            value={form.role}
            onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
            disabled={submitting}
          >
            <SelectTrigger id="uf-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Password — hidden in view mode */}
      {mode !== 'view' && (
        <div className="space-y-1.5">
          <Label htmlFor="uf-password">
            Password
            {mode === 'edit' && (
              <span className="ml-1 text-xs text-muted-foreground">
                (kosongkan jika tidak ingin diubah)
              </span>
            )}
          </Label>
          <Input
            id="uf-password"
            type="password"
            placeholder={mode === 'create' ? 'Min. 8 karakter' : '••••••••'}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required={mode === 'create'}
            minLength={mode === 'create' ? 8 : undefined}
            disabled={submitting}
          />
        </div>
      )}

      {/* Joined date — only in view mode */}
      {mode === 'view' && initialData && (
        <div className="space-y-1.5">
          <Label>Bergabung</Label>
          <Input
            value={new Date(initialData.created_at).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            disabled
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Actions — hidden in view mode (parent handles view actions) */}
      {mode !== 'view' && (
        <div className="flex gap-3 pt-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={submitting}
            >
              Batal
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      )}
    </form>
  )
}
