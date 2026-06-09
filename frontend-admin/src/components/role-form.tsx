import React from 'react'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Label } from '#/components/ui/label.tsx'
import type { Role } from '#/lib/roles.ts'

export type RoleFormMode = 'create' | 'edit' | 'view'

export interface RoleFormData {
  name: string
  description: string
}

interface RoleFormProps {
  mode: RoleFormMode
  initialData?: Role | null
  error?: string | null
  submitting?: boolean
  onSubmit?: (data: RoleFormData) => void
  onCancel?: () => void
}

export function RoleForm({
  mode,
  initialData,
  error,
  submitting = false,
  onSubmit,
  onCancel,
}: RoleFormProps) {
  const [form, setForm] = React.useState<RoleFormData>({
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)

  React.useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description,
      })
    }
  }, [initialData?.name, mode])

  const disabled = mode === 'view' || submitting
  const validationErrors = {
    name: !form.name.trim() ? 'Required' : '',
  }
  const hasValidationError = Object.values(validationErrors).some(Boolean)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    if (hasValidationError) return
    onSubmit?.(form)
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="rf-name">
          Nama Role<span className="text-destructive">*</span>
        </Label>
        <Input
          id="rf-name"
          placeholder="manager"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={disabled}
          required={mode !== 'view'}
        />
        {submitAttempted && validationErrors.name ? (
          <p className="text-right text-sm text-destructive">{validationErrors.name}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rf-description">Deskripsi</Label>
        <Input
          id="rf-description"
          placeholder="Role untuk manager"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive md:col-span-2">
          {error}
        </p>
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
