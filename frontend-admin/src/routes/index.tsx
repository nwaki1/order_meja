import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  return <main className="min-h-[calc(100vh-8rem)]" aria-hidden="true" />
}
