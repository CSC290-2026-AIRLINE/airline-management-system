// Network default wrapper. Renders Route detail in Network default mode
// (no route id, just the starting rules for every route in the network).

import { createFileRoute } from '@tanstack/react-router'
import { NetworkDefaultPage } from '@staff-web/features/onboard-products/offered-menu/NetworkDefaultPage'

export const Route = createFileRoute('/_authenticated/catering/offered-menu/network')({
  component: NetworkDefaultPage,
})
