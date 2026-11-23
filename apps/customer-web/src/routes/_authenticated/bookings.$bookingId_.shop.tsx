import { createFileRoute } from '@tanstack/react-router'
import { AddExtraServicesPage } from '../../features/onboard-products/AddExtraServicesPage'

export const Route = createFileRoute('/_authenticated/bookings/$bookingId_/shop')({
  component: BookingsBookingIdShopRoute,
})

function BookingsBookingIdShopRoute() {
  const { bookingId } = Route.useParams()
  return <AddExtraServicesPage bookingId={bookingId} />
}
