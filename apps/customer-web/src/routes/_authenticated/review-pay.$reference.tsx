import { createFileRoute } from '@tanstack/react-router'
import { BookingLayout } from '../../features/booking-search/components/BookingLayout'
import { ReviewPayPage } from '../../features/booking-pnr/review-pay/ReviewPayPage'

export const Route = createFileRoute('/_authenticated/review-pay/$reference')({
  component: ReviewPayRoute,
})

function ReviewPayRoute() {
  const { reference } = Route.useParams()
  return (
    <BookingLayout>
      <ReviewPayPage key={reference} reference={reference} />
    </BookingLayout>
  )
}
