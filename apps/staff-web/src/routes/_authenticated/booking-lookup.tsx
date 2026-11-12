import { StaffBookingLayout } from '../../features/booking-pnr/booking-lookup/StaffBookingLayout'
import { createFileRoute } from '@tanstack/react-router'
import { BookingLookupPage } from '../../features/booking-pnr/pages/BookingLookupPage'
import { parseLookupSearch } from '../../features/booking-pnr/booking-lookup/lookup-utils'

// The lookup keeps its filters in the URL, so a refresh, a shared link and the back button all show the same list.
// The fields are optional: a bare link is the default view.
export const Route = createFileRoute('/_authenticated/booking-lookup')({
  validateSearch: (search: Record<string, unknown>) => parseLookupSearch(search),
  component: () => (
    <StaffBookingLayout>
      <BookingLookupPage />
    </StaffBookingLayout>
  ),
})
