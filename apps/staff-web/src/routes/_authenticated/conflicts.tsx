import { createFileRoute } from '@tanstack/react-router'
import { ConflictsPage } from '@staff-web/features/flight-scheduling/pages/ConflictsPage'

export const Route = createFileRoute('/_authenticated/conflicts')({
  component: ConflictsPage,
})
