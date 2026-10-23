import { createFileRoute } from '@tanstack/react-router'
import { DisruptionLogPage } from '@staff-web/features/flight-scheduling/pages/DisruptionLogPage'

export const Route = createFileRoute('/_authenticated/disruption-log')({
  component: DisruptionLogPage,
})
