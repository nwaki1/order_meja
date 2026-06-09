import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/roles/$roleName')({
  component: () => <Outlet />,
})
