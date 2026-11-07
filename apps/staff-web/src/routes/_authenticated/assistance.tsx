import { createFileRoute } from '@tanstack/react-router'
import { AssistanceQueuePage } from '../../features/booking-pnr/pages/AssistanceQueuePage'

export const Route = createFileRoute('/_authenticated/assistance')({
  component: AssistanceQueuePage,
})
