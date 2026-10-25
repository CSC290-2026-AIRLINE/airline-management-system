import { createFileRoute } from '@tanstack/react-router'
import { ScheduleBoardPage } from '@staff-web/features/flight-scheduling/pages/ScheduleBoardPage'

export const Route = createFileRoute('/_authenticated/schedule-board')({
  component: ScheduleBoardPage,
})
