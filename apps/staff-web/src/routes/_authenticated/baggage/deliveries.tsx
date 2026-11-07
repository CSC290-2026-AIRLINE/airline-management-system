import { createFileRoute } from '@tanstack/react-router'
import { DeliveriesPage } from '@staff-web/features/baggage/pages/DeliveriesPage'

export const Route = createFileRoute('/_authenticated/baggage/deliveries')({
  component: DeliveriesPage,
})
