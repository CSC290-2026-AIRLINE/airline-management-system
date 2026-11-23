import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { TooltipProvider } from '../components/ui/tooltip'
import SiteHeader from '@customer-web/components/SiteHeader'
import type { RouterContext } from '../lib/router-context'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <TooltipProvider>
      <SiteHeader />
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </TooltipProvider>
  )
}
