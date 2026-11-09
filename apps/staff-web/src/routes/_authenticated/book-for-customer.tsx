import { StaffBookingLayout } from '../../features/booking-pnr/booking-lookup/StaffBookingLayout'
import { createFileRoute } from '@tanstack/react-router'
import { StaffFlightSearchPage } from '../../features/booking-search/pages/StaffFlightSearchPage'

export const Route = createFileRoute('/_authenticated/book-for-customer')({
  component: () => (
    <StaffBookingLayout>
      <StaffFlightSearchPage />
    </StaffBookingLayout>
  ),
})
