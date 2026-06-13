import * as React from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  Building2,
  CalendarClock,
  HardHat,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Shield,
  ShoppingCart,
  Store,
  Tags,
  Users,
} from 'lucide-react'

import { useAuth } from '#/components/auth-provider.tsx'
import { Avatar, AvatarFallback } from '#/components/ui/avatar.tsx'
import ThemeToggle from '#/components/ThemeToggle.tsx'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '#/components/ui/sidebar.tsx'
import { cn } from '#/lib/utils.ts'

// <-- Daftar item menu sidebar dibuat di sini -->
const mainNav = [
  {
    title: 'Dashboard',
    to: '/',
    icon: LayoutDashboard,
    end: true,
  },
  {
    title: 'Users',
    to: '/users',
    icon: Users,
    end: false,
    permission: 'users:read',
  },
  {
    title: 'Tenants',
    to: '/tenants',
    icon: Building2,
    end: false,
  },
  {
    title: 'Outlets',
    to: '/outlets',
    icon: Store,
    end: false,
    permission: 'outlets:read',
  },
  {
    title: 'Kategori Produk',
    to: '/product-categories',
    icon: Tags,
    end: false,
    permission: 'product_categories:read',
  },
  {
    title: 'Produk',
    to: '/products',
    icon: Package,
    end: false,
    permission: 'products:read',
  },
  {
    title: 'Workers',
    to: '/workers',
    icon: HardHat,
    end: false,
    permission: 'workers:read',
  },
  {
    title: 'Shifts',
    to: '/shifts',
    icon: CalendarClock,
    end: false,
    permission: 'shifts:read',
  },
  {
    title: 'POS',
    to: '/pos',
    icon: ShoppingCart,
    end: false,
    permission: 'pos:checkout',
  },
  {
    title: 'Transactions',
    to: '/transactions',
    icon: Receipt,
    end: false,
    permission: 'transactions:read',
  },
  {
    title: 'Roles',
    to: '/roles',
    icon: Shield,
    end: false,
    permission: 'roles:read',
  },
  {
    title: 'Permissions',
    to: '/permissions',
    icon: KeyRound,
    end: false,
    permission: 'permissions:read',
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { state } = useSidebar()
  const router = useRouter()
  const pathname = useRouterState({
    select: (routerState) => routerState.location.pathname,
  })
  const { user, logout, hasPermission } = useAuth()
  const visibleNav = mainNav.filter((item) => {
    return !item.permission || hasPermission(item.permission)
  })

  async function handleLogout() {
    await logout()
    await router.navigate({ to: '/login', replace: true })
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'A'

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Link
          to="/"
          className="flex items-center rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-3 no-underline transition-opacity hover:opacity-90"
        >
          <img
            src="/sidebar-logo.png"
            alt="Sportiva"
            className="h-8 w-auto object-contain dark:invert"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu className="gap-1.5">
          {/* <-- Item sidebar dirender di sini dari mainNav --> */}
          {visibleNav.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.to}
                tooltip={item.title}
                className={cn('h-10', 'justify-start')}
              >
                <Link to={item.to}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <div
          className={cn(
            'rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-2.5',
            state === 'collapsed' && 'px-2 py-2.5',
          )}
        >
          <div className="space-y-3">
            <div
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-1 py-1',
                state === 'collapsed' && 'justify-center px-0',
              )}
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-sidebar-primary text-[10px] font-bold text-sidebar-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  'min-w-0 flex-1 text-left',
                  state === 'collapsed' && 'hidden',
                )}
              >
                <p className="truncate text-sm font-semibold text-sidebar-foreground">
                  {user?.name ?? 'User'}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/70">
                  {user?.email ?? 'signed in'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div
                className={cn(
                  'flex',
                  state === 'collapsed' ? 'justify-center' : 'w-full',
                )}
              >
                <ThemeToggle
                  iconOnly={state === 'collapsed'}
                  className={cn(
                    'rounded-xl border-sidebar-border bg-sidebar text-sidebar-foreground shadow-none',
                    state === 'collapsed'
                      ? 'size-10'
                      : 'h-10 w-full justify-start px-3',
                  )}
                />
              </div>
              <SidebarMenuButton
                tooltip="Logout"
                className={cn(
                  'h-10 rounded-xl',
                  state === 'collapsed'
                    ? 'w-10 justify-center px-0 mx-auto'
                    : 'w-full justify-start',
                )}
                onClick={handleLogout}
              >
                <LogOut />
                {state !== 'collapsed' && <span>Logout</span>}
              </SidebarMenuButton>
            </div>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
