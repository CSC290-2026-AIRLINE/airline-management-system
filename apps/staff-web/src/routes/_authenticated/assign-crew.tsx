import { createFileRoute } from '@tanstack/react-router'
import { AssignCrewPage } from '@staff-web/features/crew-rostering/assign-crew/assign-crew'

export const Route = createFileRoute('/_authenticated/assign-crew')({
  component: AssignCrewPage,
})
