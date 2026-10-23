import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * Layout for the setup-crew section.
 *
 * Because `setup-crew/` also holds `$crewId.tsx`, the router nests that route
 * under this file, which makes it a layout: without an `<Outlet />` the profile
 * would have nowhere to render. The directory itself is the index route.
 */
export const Route = createFileRoute('/_authenticated/setup-crew')({
  component: () => <Outlet />,
})
