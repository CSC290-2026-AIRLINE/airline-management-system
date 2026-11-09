import { createFileRoute } from '@tanstack/react-router'
import { ReviewPayPage } from '../../features/booking-pnr/review-pay/ReviewPayPage'

export const Route = createFileRoute('/_authenticated/review-pay/$reference')({
  component: ReviewPayRoute,
})

function ReviewPayRoute() {
  const { reference } = Route.useParams()
  return <ReviewPayPage key={reference} reference={reference} />
}
