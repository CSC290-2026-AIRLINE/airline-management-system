import { createFileRoute } from '@tanstack/react-router'
import { AssistanceQueuePage } from '../../features/booking-pnr/assistance-queue/AssistanceQueuePage'

export const Route = createFileRoute('/_authenticated/assistance')({
  component: AssistanceQueuePage,
})
