import { createRootRouteWithContext, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import SiteHeader from '@customer-web/components/SiteHeader'
import type { RouterContext } from '../lib/router-context'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  /* The reports screen (F16) is a full-bleed workspace with its own sidebar, so it does not carry the site header. */
  const isWorkspace = pathname.startsWith('/reports')

  return (
    <>
      {!isWorkspace && <SiteHeader />}
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </>
  )
}
