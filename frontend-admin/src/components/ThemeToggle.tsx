import * as React from 'react'
import { LaptopMinimal, Loader2, MoonStar, SunMedium } from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { cn } from '#/lib/utils.ts'
import { type ThemeMode } from '#/lib/theme.ts'

function getNextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === 'light') {
    return 'dark'
  }

  if (mode === 'dark') {
    return 'auto'
  }

  return 'light'
}

function getThemeIcon(mode: ThemeMode) {
  if (mode === 'light') {
    return SunMedium
  }

  if (mode === 'dark') {
    return MoonStar
  }

  return LaptopMinimal
}

export default function ThemeToggle({
  className,
}: {
  className?: string
}) {
  const { themeMode, setThemeMode } = useAuth()
  const [isSaving, setIsSaving] = React.useState(false)

  const nextMode = getNextThemeMode(themeMode)
  const Icon = getThemeIcon(themeMode)

  async function handleClick() {
    setIsSaving(true)
    try {
      await setThemeMode(nextMode)
    } catch {
      // Theme save failures are non-blocking; the provider keeps the previous mode.
    } finally {
      setIsSaving(false)
    }
  }

  const label = `Tema saat ini ${themeMode}. Klik untuk pindah ke ${nextMode}.`

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      disabled={isSaving}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--sea-ink)] shadow-[0_8px_22px_rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70',
        className,
      )}
    >
      {isSaving ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
      <span>{themeMode === 'auto' ? 'Auto' : themeMode === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  )
}
