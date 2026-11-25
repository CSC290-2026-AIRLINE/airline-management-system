import { createFileRoute } from '@tanstack/react-router'
import { PageError } from '@staff-web/features/customer-service/components/PageError'
import { TemplatesPage } from '@staff-web/features/customer-service/TemplatesPage'

export const Route = createFileRoute('/_authenticated/complaints/templates')({
  component: TemplatesPage,
  errorComponent: PageError,
})
