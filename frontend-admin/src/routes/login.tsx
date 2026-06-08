import { createFileRoute } from '@tanstack/react-router'
import { LoginForm } from '#/components/login-form'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  return (
    <main className="page-wrap flex min-h-screen items-center justify-center px-4 py-10">
      <LoginForm className="w-full max-w-5xl" />
    </main>
  )
}
