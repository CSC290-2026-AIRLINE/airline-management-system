// Wrapper for the Offered menu page. The actual page lives in
// features/onboard-products/offered-menu/OfferedMenuPage so it can be
// shared with tests and (later) other entry points.

import { createFileRoute } from '@tanstack/react-router'
import { OfferedMenuPage } from '@staff-web/features/onboard-products/offered-menu/OfferedMenuPage'

export const Route = createFileRoute('/_authenticated/catering/offered-menu/')({
  component: OfferedMenuPage,
})
