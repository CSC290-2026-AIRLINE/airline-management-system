import { createFileRoute } from '@tanstack/react-router'
import { ScheduleBoardPage } from '@staff-web/features/flight-scheduling/pages/ScheduleBoardPage'

export const Route = createFileRoute('/schedule-board')({
  component: ScheduleBoardPage,
})
