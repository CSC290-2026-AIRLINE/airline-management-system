import { createFileRoute } from '@tanstack/react-router'
import ReviewAndPayPage from '@customer-web/features/cargo/ReviewAndPayPage'

export const Route = createFileRoute('/_authenticated/cargo/bookings/$id/pay')({ component: ReviewAndPayPage })
