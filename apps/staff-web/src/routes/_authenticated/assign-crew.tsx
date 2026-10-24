import { createFileRoute } from '@tanstack/react-router'
import { AssignCrewPage } from '@staff-web/features/crew-rostering/assign-crew/assign-crew'
import { parseWindowSearch } from '@staff-web/features/crew-rostering/shared/window-search'

// `dateFrom`, `dateTo` and `base` carry the window between the wizard pages.
export const Route = createFileRoute('/_authenticated/assign-crew')({
  validateSearch: parseWindowSearch,
  component: AssignCrewPage,
})
