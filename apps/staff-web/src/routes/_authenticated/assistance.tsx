import { StaffBookingLayout } from '../../features/booking-pnr/booking-lookup/StaffBookingLayout'
import { createFileRoute } from '@tanstack/react-router'
import { AssistanceQueuePage } from '../../features/booking-pnr/assistance-queue/AssistanceQueuePage'
import { StaffBookingLayout } from '../../features/booking-pnr/booking-lookup/StaffBookingLayout'

export const Route = createFileRoute('/_authenticated/assistance')({
  component: () => (
    <StaffBookingLayout>
      <AssistanceQueuePage />
    </StaffBookingLayout>
  ),
})
