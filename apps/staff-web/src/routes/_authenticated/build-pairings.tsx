import { createFileRoute } from '@tanstack/react-router'
import { BuildPairingsPage } from '@staff-web/features/crew-rostering/build-pairings/build-pairing'
import { parseWindowSearch } from '@staff-web/features/crew-rostering/shared/window-search'

// `dateFrom`, `dateTo` and `base` carry the window between the wizard pages.
export const Route = createFileRoute('/_authenticated/build-pairings')({
  validateSearch: parseWindowSearch,
  component: BuildPairingsPage,
})
