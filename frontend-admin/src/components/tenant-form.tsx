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
import type { ApiFieldErrors } from '#/lib/api.ts'
import type { Tenant } from '#/lib/tenants.ts'

export type TenantFormMode = 'create' | 'edit' | 'view'

export interface TenantFormData {
  code: string
  name: string
  is_active: boolean
}

type TenantFormFieldErrors = Partial<Record<keyof TenantFormData, string>>

interface TenantFormProps {
  mode: TenantFormMode
  initialData?: Tenant | null
  error?: string | null
  fieldErrors?: TenantFormFieldErrors | ApiFieldErrors
  submitting?: boolean
  onSubmit?: (data: TenantFormData) => void
  onCancel?: () => void
}

export function TenantForm({
  mode,
  initialData,
  error,
  fieldErrors,
  submitting = false,
  onSubmit,
  onCancel,
}: TenantFormProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [form, setForm] = React.useState<TenantFormData>({
    code: initialData?.code ?? '',
    name: initialData?.name ?? '',
    is_active: initialData?.is_active ?? true,
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [serverFieldErrors, setServerFieldErrors] =
    React.useState<TenantFormFieldErrors>({})

  React.useEffect(() => {
    if (initialData) {
      setForm({
        code: initialData.code,
        name: initialData.name,
        is_active: initialData.is_active,
      })
    }
  }, [initialData?.id, mode])

  React.useEffect(() => {
    setServerFieldErrors((fieldErrors ?? {}) as TenantFormFieldErrors)
  }, [fieldErrors])

  const disabled = mode === 'view' || submitting
  const validationErrors: TenantFormFieldErrors = {
    code: !form.code.trim() ? 'Required' : '',
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

  const visibleErrors: TenantFormFieldErrors = {
    code: submitAttempted
      ? validationErrors.code || serverFieldErrors.code || ''
      : serverFieldErrors.code || '',
    name: submitAttempted
      ? validationErrors.name || serverFieldErrors.name || ''
      : serverFieldErrors.name || '',
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
        <Label htmlFor="tf-code" className="gap-1">
          <span>
            Kode Tenant
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="tf-code"
          placeholder="MAIN"
          value={form.code}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, code: value }))
            setServerFieldErrors((current) => ({ ...current, code: '' }))
          }}
          disabled={disabled}
          required={mode !== 'view'}
        />
        {visibleErrors.code ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.code}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tf-name" className="gap-1">
          <span>
            Nama Tenant
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="tf-name"
          placeholder="Tenant utama"
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

      {(mode === 'edit' || mode === 'view') && (
        <div className="space-y-1.5">
          <Label htmlFor="tf-status">Status</Label>
          {mode === 'view' ? (
            <Input
              id="tf-status"
              value={form.is_active ? 'Aktif' : 'Nonaktif'}
              disabled
            />
          ) : (
            <Select
              value={form.is_active ? 'active' : 'inactive'}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  is_active: value === 'active',
                }))
              }
              disabled={submitting}
            >
              <SelectTrigger id="tf-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {mode === 'view' && initialData && (
        <>
          <div className="space-y-1.5">
            <Label>Dibuat</Label>
            <Input
              value={new Date(initialData.created_at).toLocaleDateString(
                'id-ID',
                {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                },
              )}
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <Label>Diperbarui</Label>
            <Input
              value={new Date(initialData.updated_at).toLocaleDateString(
                'id-ID',
                {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                },
              )}
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
