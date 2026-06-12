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
import type { Outlet } from '#/lib/outlets.ts'
import type { Tenant } from '#/lib/tenants.ts'

export type OutletFormMode = 'create' | 'edit' | 'view'

export interface OutletFormData {
  tenant_id: string
  code: string
  name: string
  address: string
  phone: string
  is_active: boolean
}

type OutletFormFieldErrors = Partial<Record<keyof OutletFormData, string>>

interface OutletFormProps {
  mode: OutletFormMode
  initialData?: Outlet | null
  tenants?: Tenant[]
  error?: string | null
  fieldErrors?: OutletFormFieldErrors | ApiFieldErrors
  submitting?: boolean
  onSubmit?: (data: OutletFormData) => void
  onCancel?: () => void
}

export function OutletForm({
  mode,
  initialData,
  tenants = [],
  error,
  fieldErrors,
  submitting = false,
  onSubmit,
  onCancel,
}: OutletFormProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [form, setForm] = React.useState<OutletFormData>({
    tenant_id: '',
    code: initialData?.code ?? '',
    name: initialData?.name ?? '',
    address: initialData?.address ?? '',
    phone: initialData?.phone ?? '',
    is_active: initialData?.is_active ?? true,
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [serverFieldErrors, setServerFieldErrors] =
    React.useState<OutletFormFieldErrors>({})

  React.useEffect(() => {
    if (initialData) {
      setForm({
        tenant_id: '',
        code: initialData.code,
        name: initialData.name,
        address: initialData.address ?? '',
        phone: initialData.phone ?? '',
        is_active: initialData.is_active,
      })
    }
  }, [initialData?.id, mode])

  React.useEffect(() => {
    setServerFieldErrors((fieldErrors ?? {}) as OutletFormFieldErrors)
  }, [fieldErrors])

  const disabled = mode === 'view' || submitting

  const validationErrors: OutletFormFieldErrors = {
    tenant_id:
      mode === 'create' && !form.tenant_id.trim() ? 'Required' : '',
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

  const visibleErrors: OutletFormFieldErrors = {
    tenant_id: submitAttempted
      ? validationErrors.tenant_id || serverFieldErrors.tenant_id || ''
      : serverFieldErrors.tenant_id || '',
    code: submitAttempted
      ? validationErrors.code || serverFieldErrors.code || ''
      : serverFieldErrors.code || '',
    name: submitAttempted
      ? validationErrors.name || serverFieldErrors.name || ''
      : serverFieldErrors.name || '',
    address: serverFieldErrors.address || '',
    phone: serverFieldErrors.phone || '',
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
          <Label>Tenant Aktif</Label>
          <Input
            value={`${initialData.current_tenant_name} (${initialData.current_tenant_code})`}
            disabled
          />
        </div>
      )}

      {mode === 'create' && (
        <div className="space-y-1.5">
          <Label htmlFor="of-tenant" className="gap-1">
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
            <SelectTrigger id="of-tenant" className="w-full">
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
        <Label htmlFor="of-code" className="gap-1">
          <span>
            Kode Outlet
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="of-code"
          placeholder="OUTLET-001"
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
        <Label htmlFor="of-name" className="gap-1">
          <span>
            Nama Outlet
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="of-name"
          placeholder="Outlet Jakarta Pusat"
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
        <Label htmlFor="of-address">Alamat</Label>
        <Input
          id="of-address"
          placeholder="Jl. Contoh No. 1"
          value={form.address}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, address: value }))
            setServerFieldErrors((current) => ({ ...current, address: '' }))
          }}
          disabled={disabled}
        />
        {visibleErrors.address ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.address}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="of-phone">Telepon</Label>
        <Input
          id="of-phone"
          placeholder="0812-3456-7890"
          value={form.phone}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, phone: value }))
            setServerFieldErrors((current) => ({ ...current, phone: '' }))
          }}
          disabled={disabled}
        />
        {visibleErrors.phone ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.phone}
          </p>
        ) : null}
      </div>

      {(mode === 'edit' || mode === 'view') && (
        <div className="space-y-1.5">
          <Label htmlFor="of-status">Status</Label>
          {mode === 'view' ? (
            <Input
              id="of-status"
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
              <SelectTrigger id="of-status" className="w-full">
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
                { day: 'numeric', month: 'long', year: 'numeric' },
              )}
              disabled
            />
          </div>
          <div className="space-y-1.5">
            <Label>Diperbarui</Label>
            <Input
              value={new Date(initialData.updated_at).toLocaleDateString(
                'id-ID',
                { day: 'numeric', month: 'long', year: 'numeric' },
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
