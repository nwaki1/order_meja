import { Link, useRouterState } from '@tanstack/react-router'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb.tsx'

type ResourceConfig = {
  plural: string
  singular: string
}

const RESOURCE_LABELS: Record<string, ResourceConfig> = {
  users: {
    plural: 'Users',
    singular: 'User',
  },
}

type Crumb = {
  label: string
  to?: string
}

function prettifySegment(segment: string) {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function buildCrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)

  if (pathname === '/' || pathname.startsWith('/login') || segments.length === 0) {
    return [] as Crumb[]
  }

  const [resourceSegment, secondSegment, thirdSegment] = segments
  const resource = RESOURCE_LABELS[resourceSegment] ?? {
    plural: prettifySegment(resourceSegment),
    singular: prettifySegment(resourceSegment).replace(/s$/i, ''),
  }

  const crumbs: Crumb[] = [
    { label: 'Dashboard', to: '/' },
    { label: resource.plural, to: `/${resourceSegment}` },
  ]

  if (!secondSegment) {
    crumbs[crumbs.length - 1].to = undefined
    return crumbs
  }

  if (secondSegment === 'new') {
    crumbs.push({ label: `Tambah ${resource.singular}` })
    return crumbs
  }

  if (!thirdSegment) {
    crumbs.push({ label: `Detail ${resource.singular}` })
    return crumbs
  }

  if (thirdSegment === 'edit') {
    crumbs.push({
      label: `Detail ${resource.singular}`,
      to: `/${resourceSegment}/${secondSegment}`,
    })
    crumbs.push({ label: `Edit ${resource.singular}` })
    return crumbs
  }

  crumbs.push({ label: prettifySegment(secondSegment), to: `/${resourceSegment}/${secondSegment}` })
  crumbs.push({ label: prettifySegment(thirdSegment) })

  return crumbs
}

export function AdminBreadcrumbs() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const crumbs = buildCrumbs(pathname)

  if (crumbs.length === 0) {
    return null
  }

  return (
    <Breadcrumb>
      <BreadcrumbList className="text-[var(--sea-ink-soft)]">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1

          return (
            <BreadcrumbItem key={`${crumb.label}-${index}`}>
              {isLast || !crumb.to ? (
                <BreadcrumbPage className="text-[var(--sea-ink)]">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild className="text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]">
                  <Link to={crumb.to}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
              {!isLast ? <BreadcrumbSeparator className="text-[var(--sea-ink-soft)]" /> : null}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
