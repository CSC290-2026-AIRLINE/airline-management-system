// Route detail wrapper. Renders a single route's menu and cabin rules
// in three modes (whole route / single flight / network default).
// The network default mode is reached from /catering/offered-menu/network.
//
// Accepts a ?flight=<id> search param so the Single-flight exceptions table
// can preselect a flight. The page reads the param and switches to Single
// flight mode automatically.

import { createFileRoute } from '@tanstack/react-router'
import { RouteDetailPage } from '@staff-web/features/onboard-products/offered-menu/RouteDetailPage'

export const Route = createFileRoute('/_authenticated/catering/offered-menu/$routeId')({
  validateSearch: (search) => ({
    flight: typeof search.flight === 'string' ? search.flight : null,
  }),
  component: RouteDetailPage,
})
