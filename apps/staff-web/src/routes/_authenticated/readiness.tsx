import { createFileRoute } from '@tanstack/react-router'
import { ReadinessPage } from '@staff-web/features/aircraft-management/ReadinessPage'

export const Route = createFileRoute('/_authenticated/readiness')({
  component: ReadinessPage,
})
