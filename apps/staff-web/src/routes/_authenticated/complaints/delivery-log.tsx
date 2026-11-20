import { createFileRoute } from '@tanstack/react-router'
import { PageError } from '@staff-web/features/customer-service/components/PageError'
import { DeliveryLogPage } from '@staff-web/features/customer-service/DeliveryLogPage'

export const Route = createFileRoute('/_authenticated/complaints/delivery-log')({
  component: DeliveryLogPage,
  errorComponent: PageError,
})
