import { createFileRoute } from '@tanstack/react-router'
import { MakeComplaintPage } from '../../features/customer-service/MakeComplaintPage'

export const Route = createFileRoute('/complaints/')({
  component: MakeComplaintPage,
})

