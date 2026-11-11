import { createFileRoute } from '@tanstack/react-router'
import { ComplaintsDashboard } from '../../features/customer-service/ComplaintsDashboard'

export const Route = createFileRoute('/_authenticated/complaints')(
  {
    component: ComplaintsDashboard,
  },
)
