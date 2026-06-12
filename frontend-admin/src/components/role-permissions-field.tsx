import React from 'react'
import { Search } from 'lucide-react'

import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import { Switch } from '#/components/ui/switch.tsx'
import { listPermissions } from '#/lib/permissions.ts'
import type { Permission } from '#/lib/permissions.ts'

interface RolePermissionsFieldProps {
  token: string
  selectedPermissions: string[]
  disabled?: boolean
  onChange: (permissions: string[]) => void
}

function toSortedArray(values: Set<string>) {
  return Array.from(values).sort((a, b) => a.localeCompare(b))
}

export function RolePermissionsField({
  token,
  selectedPermissions,
  disabled = false,
  onChange,
}: RolePermissionsFieldProps) {
  const [permissions, setPermissions] = React.useState<Permission[]>([])
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const selectedSet = React.useMemo(
    () => new Set(selectedPermissions),
    [selectedPermissions],
  )

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const permissionList = await listPermissions(token, {
          $top: 100,
          $orderby: 'name asc',
          $count: false,
        })

        if (cancelled) return

        const rows = Array.isArray(permissionList)
          ? (permissionList as unknown as Permission[])
          : permissionList.value
        setPermissions(rows)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Gagal memuat permissions')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  const filteredPermissions = React.useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return permissions

    return permissions.filter((permission) => {
      return (
        permission.name.toLowerCase().includes(text) ||
        permission.description.toLowerCase().includes(text)
      )
    })
  }, [permissions, query])

  function emit(next: Set<string>) {
    onChange(toSortedArray(next))
  }

  function togglePermission(name: string, checked: boolean) {
    const next = new Set(selectedSet)
    if (checked) {
      next.add(name)
    } else {
      next.delete(name)
    }
    emit(next)
  }

  function selectVisible() {
    const next = new Set(selectedSet)
    for (const permission of filteredPermissions) {
      next.add(permission.name)
    }
    emit(next)
  }

  function clearVisible() {
    const next = new Set(selectedSet)
    for (const permission of filteredPermissions) {
      next.delete(permission.name)
    }
    emit(next)
  }

  return (
    <section className="space-y-4 rounded-lg border border-[var(--line)] bg-muted/10 p-4 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--sea-ink)]">
            Permissions
          </h3>
          <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
            {selectedPermissions.length} permission dipilih
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={selectVisible}
            disabled={disabled || loading || filteredPermissions.length === 0}
          >
            Pilih Semua
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={clearVisible}
            disabled={disabled || loading || filteredPermissions.length === 0}
          >
            Kosongkan
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--sea-ink-soft)]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari permission..."
          className="pl-9"
          disabled={disabled || loading}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-background">
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-64 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-5 w-9 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        ) : filteredPermissions.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--sea-ink-soft)]">
            Tidak ada permission ditemukan.
          </p>
        ) : (
          <div className="max-h-80 divide-y divide-[var(--line)] overflow-y-auto">
            {filteredPermissions.map((permission) => {
              const checked = selectedSet.has(permission.name)

              return (
                <label
                  key={permission.name}
                  className="flex cursor-pointer items-center justify-between gap-4 bg-background px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--sea-ink)]">
                      {permission.name}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-[var(--sea-ink-soft)]">
                      {permission.description || '-'}
                    </span>
                  </span>
                  <Switch
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(nextChecked) =>
                      togglePermission(permission.name, nextChecked)
                    }
                    aria-label={`Toggle ${permission.name}`}
                  />
                </label>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
