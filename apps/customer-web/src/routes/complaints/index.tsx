import { createFileRoute } from '@tanstack/react-router'
import { MakeComplaintPage } from '@customer-web/features/customer-service/MakeComplaintPage'

export const Route = createFileRoute('/complaints/')({
  component: MakeComplaintPage,
})
