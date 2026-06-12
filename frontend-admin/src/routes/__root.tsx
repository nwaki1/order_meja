import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { Navigate, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { AppSidebar } from '#/components/app-sidebar.tsx'
import { AuthProvider, useAuth } from '#/components/auth-provider.tsx'
import { TooltipProvider } from '#/components/ui/tooltip.tsx'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar.tsx'

import appCss from '../styles.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var themeKey='theme';var sessionKey='sportiva_session';var legacySessionKey='sportiva_admin_session';var readMode=function(value){return value==='light'||value==='dark'||value==='auto'?value:null;};var mode=null;try{var rawSession=window.localStorage.getItem(sessionKey)||window.localStorage.getItem(legacySessionKey);if(rawSession){var parsed=JSON.parse(rawSession);mode=readMode(parsed&&parsed.user&&(parsed.user.themeMode||parsed.user.theme_mode));}}catch(e){}if(!mode){mode=readMode(window.localStorage.getItem(themeKey))||'auto';}var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(0,0,0,0.18)]">
        <TooltipProvider>
          <AuthProvider>
            <AuthGate>{children}</AuthGate>
          </AuthProvider>
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  )
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isAuthRoute = pathname.startsWith('/login')
  const { status, user } = useAuth()

  if (status === 'loading') {
    return (
      <main className="page-wrap flex min-h-screen items-center justify-center px-4 py-10">
        <div className="pointer-events-none flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[rgba(255,255,255,0.55)] px-3 py-1.5 text-xs tracking-[0.18em] text-[var(--sea-ink-soft)] opacity-70 shadow-none backdrop-blur-sm dark:bg-[rgba(24,24,24,0.55)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          <span className="uppercase">Checking session</span>
        </div>
      </main>
    )
  }

  if (isAuthRoute) {
    if (status === 'authenticated' && user) {
      return <Navigate to="/" replace />
    }

    return (
      <>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      </>
    )
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex min-h-screen flex-col">
            <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 py-3 backdrop-blur-lg">
              <SidebarTrigger />
              <div className="min-w-0">
                <p className="m-0 text-xs uppercase tracking-[0.18em] text-[var(--sea-ink-soft)]">
                  Workspace
                </p>
                <h1 className="m-0 text-sm font-semibold text-[var(--sea-ink)]">
                  Sportiva Workspace
                </h1>
              </div>
            </div>
            <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        plugins={[
          {
            name: 'Tanstack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </>
  )
}
