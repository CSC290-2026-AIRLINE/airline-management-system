import { BookingLayout } from '../../features/booking-search/components/BookingLayout'
import { createFileRoute } from '@tanstack/react-router'
import { BookingFlowPage } from '../../features/booking-pnr/flow/BookingFlowPage'
import { AssistanceFields } from '../../features/booking-pnr/assistance/AssistanceFields'
import { BookingSeatStep } from '../../features/booking-pnr/seats/BookingSeatStep'
import { SeatTakenDialog } from '../../features/booking-pnr/seats/SeatTakenDialog'

export const Route = createFileRoute('/_authenticated/booking')({
  component: () => (
    <BookingLayout>
      <BookingFlowPage AssistanceFields={AssistanceFields} SeatStep={BookingSeatStep} SeatTakenDialog={SeatTakenDialog} />
    </BookingLayout>
  ),
})
