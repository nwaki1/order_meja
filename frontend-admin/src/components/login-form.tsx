import * as React from 'react'
import { useRouter } from '@tanstack/react-router'
import { AlertCircle, ArrowRight, Loader2, ShieldCheck } from 'lucide-react'

import { cn } from '#/lib/utils.ts'
import { ApiError } from '#/lib/api.ts'
import { useAuth } from '#/components/auth-provider.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = React.useState('admin@sportiva.local')
  const [password, setPassword] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await login(email.trim(), password)
      setPassword('')
      await router.navigate({ to: '/' })
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message)
      } else if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage('Login gagal. Coba lagi.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="overflow-hidden">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="border-b border-[var(--line)] p-6 md:border-b-0 md:border-r md:p-8">
            <CardHeader className="px-0 pb-6 text-left">
              <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--sea-ink-soft)]">
                <ShieldCheck className="size-4" />
                Admin Access
              </div>
              <CardTitle className="display-title text-3xl">Sign in</CardTitle>
              <CardDescription className="max-w-md text-sm leading-6 text-[var(--sea-ink-soft)]">
                Masuk dengan akun admin backend Sportiva. Hanya role admin yang
                bisa lanjut ke dashboard.
              </CardDescription>
            </CardHeader>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="admin@sportiva.local"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <div className="flex items-center">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <a
                      href="/"
                      className="ml-auto text-sm text-[var(--sea-ink-soft)] underline-offset-4 hover:text-[var(--sea-ink)] hover:underline"
                    >
                      Back to home
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </Field>

                {errorMessage ? (
                  <div className="flex items-start gap-2 rounded-xl border border-[rgba(0,0,0,0.14)] bg-[rgba(0,0,0,0.04)] px-3 py-2 text-sm text-[var(--sea-ink)]">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                ) : null}

                <Field>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Signing in
                      </>
                    ) : (
                      <>
                        Login to Admin
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                  <FieldDescription className="text-center">
                    Backend default admin email:{' '}
                    <code>admin@sportiva.local</code>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </div>

          <div className="relative hidden bg-[linear-gradient(180deg,rgba(0,0,0,0.94),rgba(50,50,50,0.82))] md:block">
            <img
              src="/placeholder.svg"
              alt="Abstract monochrome illustration"
              className="absolute inset-0 h-full w-full object-cover opacity-90"
            />
          </div>
        </CardContent>
      </Card>

      <FieldDescription className="px-6 text-center text-[var(--sea-ink-soft)]">
        Setelah login, session token akan disimpan lokal dan logout akan
        memanggil backend untuk revoke token.
      </FieldDescription>
    </div>
  )
}
