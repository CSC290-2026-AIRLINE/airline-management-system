import { createFileRoute } from '@tanstack/react-router'
import { BookingLayout } from '../../features/booking-search/components/BookingLayout'
import type { BookingStep } from '../../features/booking-pnr/components/BookingRouteBar'
import { ReviewPayPage } from '../../features/booking-pnr/review-pay/ReviewPayPage'

/**
 * Review & pay of a held booking. The step in the URL says which part of the booking the customer is looking at:
 * 1 flights, 2 passengers, 3 seats and 4 review & pay. Without a step the page shows the review & pay itself, so a
 * plain link to the booking still lands on the page the customer expects.
 */
export const Route = createFileRoute('/_authenticated/review-pay/$reference')({
  validateSearch: (search: Record<string, unknown>): { step?: BookingStep } => ({
    step: reviewStep(search.step),
  }),
  component: ReviewPayRoute,
})

function reviewStep(value: unknown): BookingStep {
  const step = Number(value)
  return step === 1 || step === 2 || step === 3 || step === 4 ? step : 4
}

function ReviewPayRoute() {
  const { reference } = Route.useParams()
  const { step } = Route.useSearch()
  return (
    <BookingLayout>
      <ReviewPayPage key={reference} reference={reference} step={step ?? 4} />
    </BookingLayout>
  )
}
