import { createFileRoute } from '@tanstack/react-router'
import { PageError } from '@staff-web/features/customer-service/components/PageError'
import { ComplaintsDashboard } from '@staff-web/features/customer-service/ComplaintsDashboard'

export const Route = createFileRoute('/_authenticated/complaints/')({
  component: ComplaintsDashboard,
  errorComponent: PageError,
})
