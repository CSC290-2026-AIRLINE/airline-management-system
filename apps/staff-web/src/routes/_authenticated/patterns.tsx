import { createFileRoute } from '@tanstack/react-router'
import { PatternsPage } from '@staff-web/features/flight-scheduling/pages/PatternsPage'

export const Route = createFileRoute('/_authenticated/patterns')({
  component: PatternsPage,
})
