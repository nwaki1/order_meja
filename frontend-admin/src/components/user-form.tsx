import React from 'react'
import { useAuth } from '#/components/auth-provider.tsx'
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
import type { ApiFieldErrors } from '#/lib/api.ts'
import { listRoles } from '#/lib/roles.ts'
import type { User } from '#/lib/users.ts'

export type UserFormMode = 'create' | 'edit' | 'view'

export interface UserFormData {
  name: string
  email: string
  role: string
  password: string
}

type UserFormFieldErrors = Partial<Record<keyof UserFormData, string>>

interface UserFormProps {
  mode: UserFormMode
  initialData?: User | null
  error?: string | null
  fieldErrors?: UserFormFieldErrors | ApiFieldErrors
  submitting?: boolean
  onSubmit?: (data: UserFormData) => void
  onCancel?: () => void
}

export function UserForm({
  mode,
  initialData,
  error,
  fieldErrors,
  submitting = false,
  onSubmit,
  onCancel,
}: UserFormProps) {
  const { session } = useAuth()
  const accessToken = session?.accessToken
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [form, setForm] = React.useState<UserFormData>({
    name: initialData?.name ?? '',
    email: initialData?.email ?? '',
    role: initialData?.role ?? 'user',
    password: '',
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [serverFieldErrors, setServerFieldErrors] = React.useState<UserFormFieldErrors>({})
  const [roleNames, setRoleNames] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!accessToken || mode === 'view') return
    let cancelled = false
    listRoles(accessToken, { $top: 100, $skip: 0, $orderby: 'name asc' })
      .then((res) => {
        if (!cancelled) {
          const rows = Array.isArray(res) ? res : (res.value ?? [])
          setRoleNames(rows.map((r) => r.name))
        }
      })
      .catch(() => {
        // fall back to whatever the current value is
      })
    return () => {
      cancelled = true
    }
  }, [accessToken, mode])

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

  React.useEffect(() => {
    setServerFieldErrors((fieldErrors ?? {}) as UserFormFieldErrors)
  }, [fieldErrors])

  const disabled = mode === 'view' || submitting
  const requiresPassword = mode === 'create'
  const validationErrors: UserFormFieldErrors = {
    name: !form.name.trim() ? 'Required' : '',
    email: !form.email.trim() ? 'Required' : '',
    role: !form.role.trim() ? 'Required' : '',
    password: requiresPassword && !form.password.trim() ? 'Required' : '',
  }
  const hasValidationError = Object.values(validationErrors).some(Boolean)
  const hasServerFieldError = Object.values(serverFieldErrors).some(Boolean)

  React.useEffect(() => {
    if (error || hasServerFieldError) {
      formRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }, [error, hasServerFieldError])

  const visibleErrors: UserFormFieldErrors = {
    name: submitAttempted ? validationErrors.name || serverFieldErrors.name || '' : serverFieldErrors.name || '',
    email: submitAttempted
      ? validationErrors.email || serverFieldErrors.email || ''
      : serverFieldErrors.email || '',
    role: submitAttempted ? validationErrors.role || serverFieldErrors.role || '' : serverFieldErrors.role || '',
    password: submitAttempted
      ? validationErrors.password || serverFieldErrors.password || ''
      : serverFieldErrors.password || '',
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    if (hasValidationError) {
      formRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return
    }
    onSubmit?.(form)
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="grid gap-5 md:grid-cols-2"
    >
      {submitAttempted && hasValidationError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive md:col-span-2">
          Lengkapi field yang required atau isi teks yang sesuai.
        </p>
      )}

      {!hasValidationError && error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive md:col-span-2">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="uf-name" className="gap-1">
          <span>
            Nama<span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="uf-name"
          placeholder="John Doe"
          value={form.name}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, name: value }))
            setServerFieldErrors((current) => ({ ...current, name: '' }))
          }}
          disabled={disabled}
          required={mode !== 'view'}
        />
        {visibleErrors.name ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.name}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="uf-email" className="gap-1">
          <span>
            Email<span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="uf-email"
          type="email"
          placeholder="john@example.com"
          value={form.email}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, email: value }))
            setServerFieldErrors((current) => ({ ...current, email: '' }))
          }}
          disabled={disabled}
          required={mode !== 'view'}
        />
        {visibleErrors.email ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="uf-role" className="gap-1">
          <span>
            Role<span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        {mode === 'view' ? (
          <Input id="uf-role" value={form.role} disabled />
        ) : (
          <Select
            value={form.role}
            onValueChange={(value) => {
              setForm((current) => ({ ...current, role: value }))
              setServerFieldErrors((current) => ({ ...current, role: '' }))
            }}
            disabled={submitting}
          >
            <SelectTrigger id="uf-role" className="w-full">
              <SelectValue placeholder="Pilih role" />
            </SelectTrigger>
            <SelectContent>
              {(roleNames.length > 0
                ? roleNames
                : [form.role].filter(Boolean)
              ).map((roleName) => (
                <SelectItem key={roleName} value={roleName}>
                  {roleName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {visibleErrors.role ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.role}
          </p>
        ) : null}
      </div>

      {mode !== 'view' && (
        <div className="space-y-1.5">
          <Label htmlFor="uf-password" className="gap-1.5">
            <span>
              Password
              {requiresPassword ? (
                <span className="ml-0.5 font-bold text-destructive">*</span>
              ) : null}
            </span>
            {mode === 'edit' && (
              <span className="ml-1 text-xs text-muted-foreground">
                (kosongkan jika tidak ingin diubah)
              </span>
            )}
          </Label>
          <Input
            id="uf-password"
            type="password"
            placeholder={mode === 'create' ? 'Min. 8 karakter' : '********'}
            value={form.password}
            onChange={(e) => {
              const value = e.target.value
              setForm((current) => ({ ...current, password: value }))
              setServerFieldErrors((current) => ({ ...current, password: '' }))
            }}
            required={mode === 'create'}
            minLength={mode === 'create' ? 8 : undefined}
            disabled={submitting}
          />
          {visibleErrors.password ? (
            <p className="self-start text-left text-sm font-semibold text-destructive">
              {visibleErrors.password}
            </p>
          ) : null}
        </div>
      )}

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

      {mode !== 'view' && (
        <div className="flex gap-3 pt-2 md:col-span-2">
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
