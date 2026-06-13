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
import { Textarea } from '#/components/ui/textarea.tsx'
import type { ApiFieldErrors } from '#/lib/api.ts'
import type { ProductCategory } from '#/lib/product-categories.ts'
import type { Tenant } from '#/lib/tenants.ts'

export type ProductCategoryFormMode = 'create' | 'edit' | 'view'

export interface ProductCategoryFormData {
  tenant_id: string
  name: string
  description: string
  is_active: boolean
}

type ProductCategoryFormFieldErrors = Partial<
  Record<keyof ProductCategoryFormData, string>
>

interface ProductCategoryFormProps {
  mode: ProductCategoryFormMode
  initialData?: ProductCategory | null
  tenants?: Tenant[]
  error?: string | null
  fieldErrors?: ProductCategoryFormFieldErrors | ApiFieldErrors
  submitting?: boolean
  onSubmit?: (data: ProductCategoryFormData) => void
  onCancel?: () => void
}

export function ProductCategoryForm({
  mode,
  initialData,
  tenants = [],
  error,
  fieldErrors,
  submitting = false,
  onSubmit,
  onCancel,
}: ProductCategoryFormProps) {
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [form, setForm] = React.useState<ProductCategoryFormData>({
    tenant_id: '',
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    is_active: initialData?.is_active ?? true,
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [serverFieldErrors, setServerFieldErrors] =
    React.useState<ProductCategoryFormFieldErrors>({})

  React.useEffect(() => {
    if (initialData) {
      setForm({
        tenant_id: '',
        name: initialData.name,
        description: initialData.description ?? '',
        is_active: initialData.is_active,
      })
    }
  }, [initialData?.id, mode])

  React.useEffect(() => {
    setServerFieldErrors((fieldErrors ?? {}) as ProductCategoryFormFieldErrors)
  }, [fieldErrors])

  const disabled = mode === 'view' || submitting

  const validationErrors: ProductCategoryFormFieldErrors = {
    tenant_id: mode === 'create' && !form.tenant_id.trim() ? 'Required' : '',
    name: !form.name.trim() ? 'Required' : '',
  }
  const hasValidationError = Object.values(validationErrors).some(Boolean)
  const hasServerFieldError = Object.values(serverFieldErrors).some(Boolean)

  React.useEffect(() => {
    if (error || hasServerFieldError) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [error, hasServerFieldError])

  const visibleErrors: ProductCategoryFormFieldErrors = {
    tenant_id: submitAttempted
      ? validationErrors.tenant_id || serverFieldErrors.tenant_id || ''
      : serverFieldErrors.tenant_id || '',
    name: submitAttempted
      ? validationErrors.name || serverFieldErrors.name || ''
      : serverFieldErrors.name || '',
    description: serverFieldErrors.description || '',
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
          <Label htmlFor="pcf-tenant" className="gap-1">
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
            <SelectTrigger id="pcf-tenant" className="w-full">
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
        <Label htmlFor="pcf-name" className="gap-1">
          <span>
            Nama Kategori
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="pcf-name"
          placeholder="Minuman"
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

      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="pcf-description">Deskripsi</Label>
        <Textarea
          id="pcf-description"
          placeholder="Kategori minuman dingin dan panas"
          value={form.description}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, description: value }))
            setServerFieldErrors((current) => ({ ...current, description: '' }))
          }}
          disabled={disabled}
        />
        {visibleErrors.description ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.description}
          </p>
        ) : null}
      </div>

      {(mode === 'edit' || mode === 'view') && (
        <div className="space-y-1.5">
          <Label htmlFor="pcf-status">Status</Label>
          {mode === 'view' ? (
            <Input
              id="pcf-status"
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
              <SelectTrigger id="pcf-status" className="w-full">
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
