import * as React from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, LogOut, Users } from 'lucide-react'

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
} from '#/components/ui/sidebar.tsx'
import { cn } from '#/lib/utils.ts'

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
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { user, logout } = useAuth()

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
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground">
              <span className="text-xs font-bold tracking-[0.2em]">SA</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                Admin
              </p>
              <p className="truncate text-xs text-sidebar-foreground/70">
                Monochrome admin shell
              </p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu className="gap-1.5">
          {mainNav.map((item) => (
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
        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-sidebar-primary text-[10px] font-bold text-sidebar-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">
                    {user?.name ?? 'Admin'}
                  </p>
                  <p className="truncate text-xs text-sidebar-foreground/70">
                    {user?.email ?? 'signed in'}
                  </p>
                </div>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <div className="px-2 pb-1">
                <ThemeToggle className="w-full justify-start rounded-xl px-3 py-2.5" />
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Logout" className="h-10" onClick={handleLogout}>
                <LogOut />
                <span>Logout</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
