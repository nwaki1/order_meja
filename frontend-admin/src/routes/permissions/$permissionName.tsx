import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/permissions/$permissionName')({
  component: Outlet,
})
