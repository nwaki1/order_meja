import React from 'react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import type { ApiFieldErrors } from '#/lib/api.ts'
import type { Role } from '#/lib/roles.ts'

export type RoleFormMode = 'create' | 'edit' | 'view'

export interface RoleFormData {
  name: string
  description: string
}

type RoleFormFieldErrors = Partial<Record<keyof RoleFormData, string>>

interface RoleFormProps {
  mode: RoleFormMode
  initialData?: Role | null
  error?: string | null
  fieldErrors?: RoleFormFieldErrors | ApiFieldErrors
  submitting?: boolean
  onSubmit?: (data: RoleFormData) => void
  onCancel?: () => void
}

export function RoleForm({
  mode,
  initialData,
  error,
  fieldErrors,
  submitting = false,
  onSubmit,
  onCancel,
}: RoleFormProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [form, setForm] = React.useState<RoleFormData>({
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [serverFieldErrors, setServerFieldErrors] = React.useState<RoleFormFieldErrors>({})

  React.useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description,
      })
    }
  }, [initialData?.name, mode])

  React.useEffect(() => {
    setServerFieldErrors((fieldErrors ?? {}) as RoleFormFieldErrors)
  }, [fieldErrors])

  const disabled = mode === 'view' || submitting
  const validationErrors: RoleFormFieldErrors = {
    name: !form.name.trim() ? 'Required' : '',
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

  const visibleErrors: RoleFormFieldErrors = {
    name: submitAttempted ? validationErrors.name || serverFieldErrors.name || '' : serverFieldErrors.name || '',
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
        <Label htmlFor="rf-name" className="gap-1">
          <span>
            Nama Role<span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="rf-name"
          placeholder="manager"
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
        <Label htmlFor="rf-description">Deskripsi</Label>
        <Input
          id="rf-description"
          placeholder="Role untuk manager"
          value={form.description}
          onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
          disabled={disabled}
        />
      </div>

      {mode === 'view' && initialData && (
        <>
          <div className="space-y-1.5">
            <Label>Dibuat</Label>
            <Input
              value={new Date(initialData.created_at).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <Label>Diperbarui</Label>
            <Input
              value={new Date(initialData.updated_at).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              disabled
            />
          </div>
        </>
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
