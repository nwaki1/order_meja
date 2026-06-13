import React from 'react'
import { ImagePlus, X } from 'lucide-react'
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
import { Switch } from '#/components/ui/switch.tsx'
import { Textarea } from '#/components/ui/textarea.tsx'
import type { ApiFieldErrors } from '#/lib/api.ts'
import { uploadFile } from '#/lib/files.ts'
import type { ProductCategory } from '#/lib/product-categories.ts'
import type { Product } from '#/lib/products.ts'
import type { Tenant } from '#/lib/tenants.ts'

export type ProductFormMode = 'create' | 'edit' | 'view'

const NO_CATEGORY = '__none__'

export interface ProductFormData {
  tenant_id: string
  category_id: string
  sku: string
  name: string
  description: string
  image_url: string
  unit: string
  is_stock_tracked: boolean
  is_active: boolean
}

type ProductFormFieldErrors = Partial<Record<keyof ProductFormData, string>>

interface ProductFormProps {
  mode: ProductFormMode
  initialData?: Product | null
  tenants?: Tenant[]
  categories?: ProductCategory[]
  error?: string | null
  fieldErrors?: ProductFormFieldErrors | ApiFieldErrors
  submitting?: boolean
  onSubmit?: (data: ProductFormData) => void
  onCancel?: () => void
}

export function ProductForm({
  mode,
  initialData,
  tenants = [],
  categories = [],
  error,
  fieldErrors,
  submitting = false,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const { session } = useAuth()
  const accessToken = session?.accessToken
  const formRef = React.useRef<HTMLFormElement | null>(null)
  const [form, setForm] = React.useState<ProductFormData>({
    tenant_id: initialData?.tenant_id ?? '',
    category_id: initialData?.category_id ?? '',
    sku: initialData?.sku ?? '',
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    image_url: initialData?.image_url ?? '',
    unit: initialData?.unit ?? 'pcs',
    is_stock_tracked: initialData?.is_stock_tracked ?? false,
    is_active: initialData?.is_active ?? true,
  })
  const [submitAttempted, setSubmitAttempted] = React.useState(false)
  const [serverFieldErrors, setServerFieldErrors] =
    React.useState<ProductFormFieldErrors>({})
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (initialData) {
      setForm({
        tenant_id: initialData.tenant_id,
        category_id: initialData.category_id ?? '',
        sku: initialData.sku,
        name: initialData.name,
        description: initialData.description ?? '',
        image_url: initialData.image_url ?? '',
        unit: initialData.unit ?? 'pcs',
        is_stock_tracked: initialData.is_stock_tracked,
        is_active: initialData.is_active,
      })
    }
  }, [initialData?.id, mode])

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file || !accessToken) return
    setUploading(true)
    setUploadError(null)
    try {
      const uploaded = await uploadFile(accessToken, file, 'products')
      setForm((current) => ({ ...current, image_url: uploaded.url }))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Gagal upload gambar')
    } finally {
      setUploading(false)
    }
  }

  React.useEffect(() => {
    setServerFieldErrors((fieldErrors ?? {}) as ProductFormFieldErrors)
  }, [fieldErrors])

  const disabled = mode === 'view' || submitting

  // The active tenant scopes which categories can be picked.
  const activeTenantId =
    mode === 'create' ? form.tenant_id : (initialData?.tenant_id ?? '')
  const tenantCategories = categories.filter(
    (c) =>
      c.tenant_id === activeTenantId &&
      (c.is_active || c.id === form.category_id),
  )

  const validationErrors: ProductFormFieldErrors = {
    tenant_id: mode === 'create' && !form.tenant_id.trim() ? 'Required' : '',
    sku: !form.sku.trim() ? 'Required' : '',
    name: !form.name.trim() ? 'Required' : '',
  }
  const hasValidationError = Object.values(validationErrors).some(Boolean)
  const hasServerFieldError = Object.values(serverFieldErrors).some(Boolean)

  React.useEffect(() => {
    if (error || hasServerFieldError) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [error, hasServerFieldError])

  const visibleErrors: ProductFormFieldErrors = {
    tenant_id: submitAttempted
      ? validationErrors.tenant_id || serverFieldErrors.tenant_id || ''
      : serverFieldErrors.tenant_id || '',
    sku: submitAttempted
      ? validationErrors.sku || serverFieldErrors.sku || ''
      : serverFieldErrors.sku || '',
    name: submitAttempted
      ? validationErrors.name || serverFieldErrors.name || ''
      : serverFieldErrors.name || '',
    category_id: serverFieldErrors.category_id || '',
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
          <Label htmlFor="pf-tenant" className="gap-1">
            <span>
              Tenant
              <span className="ml-0.5 font-bold text-destructive">*</span>
            </span>
          </Label>
          <Select
            value={form.tenant_id}
            onValueChange={(value) => {
              setForm((current) => ({
                ...current,
                tenant_id: value,
                // reset category when tenant changes
                category_id: '',
              }))
              setServerFieldErrors((current) => ({ ...current, tenant_id: '' }))
            }}
            disabled={disabled}
          >
            <SelectTrigger id="pf-tenant" className="w-full">
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
        <Label htmlFor="pf-category">Kategori</Label>
        {mode === 'view' ? (
          <Input value={initialData?.category_name ?? '-'} disabled />
        ) : (
          <Select
            value={form.category_id || NO_CATEGORY}
            onValueChange={(value) => {
              setForm((current) => ({
                ...current,
                category_id: value === NO_CATEGORY ? '' : value,
              }))
              setServerFieldErrors((current) => ({
                ...current,
                category_id: '',
              }))
            }}
            disabled={disabled || (mode === 'create' && !form.tenant_id)}
          >
            <SelectTrigger id="pf-category" className="w-full">
              <SelectValue placeholder="Tanpa kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>Tanpa kategori</SelectItem>
              {tenantCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {visibleErrors.category_id ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.category_id}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-sku" className="gap-1">
          <span>
            SKU
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="pf-sku"
          placeholder="PRD-001"
          value={form.sku}
          onChange={(e) => {
            const value = e.target.value
            setForm((current) => ({ ...current, sku: value }))
            setServerFieldErrors((current) => ({ ...current, sku: '' }))
          }}
          disabled={disabled}
          required={mode !== 'view'}
        />
        {visibleErrors.sku ? (
          <p className="self-start text-left text-sm font-semibold text-destructive">
            {visibleErrors.sku}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-name" className="gap-1">
          <span>
            Nama Produk
            <span className="ml-0.5 font-bold text-destructive">*</span>
          </span>
        </Label>
        <Input
          id="pf-name"
          placeholder="Es Teh Manis"
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
        <Label htmlFor="pf-description">Deskripsi</Label>
        <Textarea
          id="pf-description"
          placeholder="Deskripsi produk"
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

      <div className="space-y-1.5 md:col-span-2">
        <Label>Gambar Produk</Label>
        <div className="flex items-center gap-4">
          {form.image_url ? (
            <img
              src={form.image_url}
              alt="Produk"
              className="size-20 rounded-md border border-[var(--line)] object-cover"
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-md border border-dashed border-[var(--line)] text-[var(--sea-ink-soft)]">
              <ImagePlus className="size-6" />
            </div>
          )}
          {mode !== 'view' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--sea-ink)] hover:bg-muted/40">
                  <ImagePlus className="size-4" />
                  {uploading ? 'Mengunggah...' : 'Pilih Gambar'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleImageChange}
                    disabled={disabled || uploading}
                  />
                </label>
                {form.image_url && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setForm((current) => ({ ...current, image_url: '' }))
                    }
                    disabled={disabled || uploading}
                  >
                    <X />
                    Hapus
                  </Button>
                )}
              </div>
              <p className="text-xs text-[var(--sea-ink-soft)]">
                JPG/PNG/WEBP, maks 10MB.
              </p>
              {uploadError && (
                <p className="text-xs font-medium text-destructive">
                  {uploadError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-unit">Satuan</Label>
        {mode === 'view' ? (
          <Input id="pf-unit" value={form.unit || '-'} disabled />
        ) : (
          <Input
            id="pf-unit"
            placeholder="pcs"
            value={form.unit}
            onChange={(e) => {
              const value = e.target.value
              setForm((current) => ({ ...current, unit: value }))
            }}
            disabled={disabled}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-tracked">Lacak Stok</Label>
        {mode === 'view' ? (
          <Input
            id="pf-tracked"
            value={form.is_stock_tracked ? 'Ya' : 'Tidak'}
            disabled
          />
        ) : (
          <div className="flex h-9 items-center gap-2">
            <Switch
              id="pf-tracked"
              checked={form.is_stock_tracked}
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  is_stock_tracked: checked,
                }))
              }
              disabled={disabled}
            />
            <span className="text-sm text-[var(--sea-ink-soft)]">
              {form.is_stock_tracked
                ? 'Stok produk dilacak per outlet'
                : 'Produk tanpa pelacakan stok'}
            </span>
          </div>
        )}
      </div>

      {(mode === 'edit' || mode === 'view') && (
        <div className="space-y-1.5">
          <Label htmlFor="pf-status">Status</Label>
          {mode === 'view' ? (
            <Input
              id="pf-status"
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
              <SelectTrigger id="pf-status" className="w-full">
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
