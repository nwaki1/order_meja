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
import type { Worker } from '#/lib/workers.ts'
import type { Tenant } from '#/lib/tenants.ts'

export type WorkerFormMode = 'create' | 'edit' | 'view'

export interface WorkerFormData {
  tenant_id: string
  code: string
  name: string
  phone: string
  email: string
  is_active: boolean
}

type WorkerFormFieldErrors = Partial<Record<keyof WorkerFormData, string>>

interface WorkerFormProps {
  mode: WorkerFormMode
  initialData?: Worker | null
  tenants?: Tenant[]
  error?: string | null
  fieldErrors?: WorkerFormFieldErrors | ApiFieldErrors
  submitting?: boolean
  onSubmit?: (data: WorkerFormData) => void
  onCancel?: () => void
}

export function WorkerForm({
  mode,
  initialData,
  tenants = [],
  error,
  fieldErrors,
  submitting = false,
  onSubmit,
  onCancel,
}: WorkerFormProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [form, setForm] = React.useState<WorkerFormData>({
    tenant_id: initialData?.tenant_id ?? '',
    code: initialData?.code ?? '',
    name: initialData?.name ?? '',
    phone: initialData?.phone ?? '',
    email: initialData?.email ?? '',
    is_active: initialData?.is_active ?? true,
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [serverFieldErrors, setServerFieldErrors] =
    React.useState<WorkerFormFieldErrors>({})

  React.useEffect(() => {
    if (initialData) {
      setForm({
        tenant_id: initialData.tenant_id,
        code: initialData.code,
        name: initialData.name,
        phone: initialData.phone ?? '',
        email: initialData.email ?? '',
        is_active: initialData.is_active,
      })
    }
  }, [initialData?.id, mode])

  React.useEffect(() => {
    setServerFieldErrors((fieldErrors ?? {}) as WorkerFormFieldErrors)
  }, [fieldErrors])

  const disabled = mode === 'view' || submitting

  const validationErrors: WorkerFormFieldErrors = {
    tenant_id: mode === 'create' && !form.tenant_id.trim() ? 'Required' : '',
    code: !form.code.trim() ? 'Required' : '',
    name: !form.name.trim() ? 'Required' : '',
  }
  const hasValidationError = Object.values(validationErrors).some(Boolean)
  const hasServerFieldError = Object.values(serverFieldErrors).some(Boolean)

  React.useEffect(() => {
    if (error || hasServerFieldError) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [error, hasServerFieldError])

  const visibleErrors: WorkerFormFieldErrors = {
    tenant_id: submitAttempted
      ? validationErrors.tenant_id || serverFieldErrors.tenant_id || ''
      : serverFieldErrors.tenant_id || '',
    code: submitAttempted
      ? validationErrors.code || serverFieldErrors.code || ''
      : serverFieldErrors.code || '',
    name: submitAttempted
      ? validationErrors.name || serverFieldErrors.name || ''
      : serverFieldErrors.name || '',
    phone: serverFieldErrors.phone || '',
    email: serverFieldErrors.email || '',
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    if (hasValidationError) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

      {mode === 'view' && initialData && (
        <div className="space-y-1.5">
          <Label>Tenant</Label>
          <Input
            value={`${initialData.tenant_name} (${initialData.tenant_code})`}
            disabled
          />
        </div>
      )}

      {mode === 'create' && (
        <div className="space-y-1.5">
          <Label htmlFor="wf-tenant" className="gap-1">
            <span>
              Tenant
              <span className="ml-0.5 font-bold text-destructive">*</span>
            </span>
          </Label>
          <Select
            value={form.tenant_id}
            onValueChange={(value) => {
              setForm((current) => ({ ...current, tenant_id: value }))
              setServerFieldErrors((current) => ({ ...current, tenant_id: '' }))
            }}
            disabled={disabled}
          >
            <SelectTrigger id="wf-tenant" className="w-full">
              <SelectValue placeholder="Pilih tenant" />
            </SelectTrigger>
            <SelectContent>
              {tenants
                .filter((t) => t.is_active)
                .map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {visibleErrors.tenant_id ? (
            <p className="self-start text-left text-sm font-semibold text-destructive">
              {visibleErrors.tenant_id}
            </p>
          ) : null}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="wf-code" className="gap-1">
          <span>
            Kode Worker
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="wf-code"
          placeholder="WRK-001"
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
        <Label htmlFor="wf-name" className="gap-1">
          <span>
            Nama
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="wf-name"
          placeholder="Budi"
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
        <Label htmlFor="wf-phone">Telepon</Label>
        <Input
          id="wf-phone"
          placeholder="0812-3456-7890"
          value={form.phone}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, phone: value }))
          }}
          disabled={disabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wf-email">Email</Label>
        <Input
          id="wf-email"
          placeholder="budi@example.com"
          value={form.email}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, email: value }))
          }}
          disabled={disabled}
        />
      </div>

      {(mode === 'edit' || mode === 'view') && (
        <div className="space-y-1.5">
          <Label htmlFor="wf-status">Status</Label>
          {mode === 'view' ? (
            <Input
              id="wf-status"
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
              <SelectTrigger id="wf-status" className="w-full">
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
