import { BookingLayout } from '../../features/booking-search/components/BookingLayout'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BookingFlowPage } from '../../features/booking-pnr/flow/BookingFlowPage'
import { BookingSeatStep } from '../../features/booking-pnr/seats/BookingSeatStep'
import { SeatTakenDialog } from '../../features/booking-pnr/seats/SeatTakenDialog'
import { AssistanceFields } from '../../features/booking-pnr/assistance/AssistanceFields'
import { PriceChangedDialog } from '../../features/booking-pnr/components/PriceChangedDialog'

export const Route = createFileRoute('/_authenticated/booking')({
  component: BookingRoute,
})

function BookingRoute() {
  const navigate = useNavigate()
  return (
    <BookingLayout>
      <BookingFlowPage
        SeatStep={BookingSeatStep}
        AssistanceFields={AssistanceFields}
        SeatTakenDialog={SeatTakenDialog}
        PriceChangedDialog={PriceChangedDialog}
        onHeld={({ reference }) => {
          void navigate({ to: '/review-pay/$reference', params: { reference } })
        }}
      />
    </BookingLayout>
  )
}
