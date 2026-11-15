import { StaffBookingLayout } from '../../features/booking-pnr/booking-lookup/StaffBookingLayout'
import { createFileRoute } from '@tanstack/react-router'
import { BookForCustomerPage } from '../../features/booking-pnr/book-for-customer/BookForCustomerPage'

export const Route = createFileRoute('/_authenticated/book-for-customer')({
  component: () => (
    <StaffBookingLayout>
      <BookForCustomerPage />
    </StaffBookingLayout>
  ),
})
