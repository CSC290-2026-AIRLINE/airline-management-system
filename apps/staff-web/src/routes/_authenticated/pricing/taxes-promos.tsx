import { createFileRoute } from '@tanstack/react-router'
import { TaxesPromosPage } from '@staff-web/features/pricing/taxes-promos/TaxesPromosPage'

export const Route = createFileRoute('/_authenticated/pricing/taxes-promos')({
  component: TaxesPromosPage,
})
