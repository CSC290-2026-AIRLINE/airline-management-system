import { createFileRoute } from '@tanstack/react-router'
import { PageError } from '@staff-web/features/customer-service/components/PageError'
import { ChartsPage } from '@staff-web/features/customer-service/ChartsPage'

export const Route = createFileRoute('/_authenticated/complaints/charts')({
  component: ChartsPage,
  errorComponent: PageError,
})
