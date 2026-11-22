import type { BookingDetail, BookingServiceRequest } from '../api/types'
import { StatusChip } from '../components/StatusChip'
import { Avatar, AvatarFallback } from '@customer-web/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { FeatureAction } from './FeatureAction'
import { ASSISTANCE_DISABLED, initialOf, passengerRole, serviceRequestChip } from './booking-detail-model'

/**
 * The passengers of a booking with their roles, and the assistance requests they made (D8).
 */
export function PassengersCard({ booking }: { booking: BookingDetail }) {
  const requestsByPassenger = new Map<string, BookingServiceRequest[]>()
  for (const request of booking.serviceRequests) {
    const requests = requestsByPassenger.get(request.bookingPassengerId) ?? []
    requests.push(request)
    requestsByPassenger.set(request.bookingPassengerId, requests)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passengers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="list-none divide-y p-0">
          {booking.passengers.map((passenger) => {
            const requests = requestsByPassenger.get(passenger.bookingPassengerId) ?? []
            const lapAdult = passenger.lapOfBookingPassengerId
              ? booking.passengers.find((adult) => adult.bookingPassengerId === passenger.lapOfBookingPassengerId)
              : undefined

            return (
              <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0" key={passenger.bookingPassengerId}>
                <Avatar className="size-9">
                  <AvatarFallback className="text-sm font-medium">{initialOf(passenger.firstName)}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {passenger.firstName} {passenger.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {passengerRole(passenger, booking.accountHolderPassengerId)}
                    {lapAdult ? ` · on ${lapAdult.firstName}'s lap` : ''}
                  </p>
                </div>

                {requests.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {requests.map((request) => {
                      const chip = serviceRequestChip(request.status)
                      return <StatusChip key={request.serviceRequestId} label={`${request.serviceCode} · ${chip.label}`} tone={chip.tone} />
                    })}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        {/* Assistance can only be asked for while the booking is held or confirmed. */}
        {(booking.status === 'held' || booking.status === 'confirmed') && (
          <FeatureAction label="Request assistance" reason={ASSISTANCE_DISABLED} variant="link" />
        )}
      </CardContent>
    </Card>
  )
}
