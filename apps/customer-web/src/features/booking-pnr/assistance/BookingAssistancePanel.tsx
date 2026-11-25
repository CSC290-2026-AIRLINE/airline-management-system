import { useState } from 'react'
import { Accessibility, Plus } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { Field } from '@customer-web/components/ui/field'
import { useBookingPnrApi } from '../api/client'
import { useBooking } from '../api/useBooking'
import { AssistanceRequestDialog } from './AssistanceRequestDialog'
import { AssistanceStatus } from './AssistanceStatus'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'

export function BookingAssistancePanel({ reference, onChanged }: { reference: string; onChanged: () => void }) {
  const api = useBookingPnrApi()
  const { booking, reload, isLoading, error } = useBooking(reference)
  const [passengerId, setPassengerId] = useState<string | null>(null)
  const [segmentId, setSegmentId] = useState('')

  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Loading assistance requests…
      </p>
    )
  if (error)
    return (
      <Card aria-label="Special assistance">
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-destructive" role="alert">
            Could not load assistance requests.
          </p>
          <Button variant="outline" size="sm" type="button" onClick={() => void reload()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    )
  if (!booking || !['held', 'confirmed'].includes(booking.status)) return null

  return (
    <Card aria-label="Special assistance">
      <CardHeader>
        <CardTitle>Special assistance</CardTitle>
        <CardDescription>Request support for a passenger and track the airport team’s response.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs">
          <Field id="assistance-flight" label="Flight">
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger id="assistance-flight" aria-labelledby="assistance-flight-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All flights</SelectItem>
                {booking.segments.map((segment) => (
                  <SelectItem key={segment.bookingSegmentId} value={segment.bookingSegmentId}>
                    {segment.flightNumber} · {segment.origin} → {segment.destination}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="divide-y rounded-lg border">
          {booking.passengers.map((passenger) => {
            const requests = booking.serviceRequests.filter(
              (item) =>
                item.bookingPassengerId === passenger.bookingPassengerId &&
                (!segmentId || item.bookingSegmentId === null || item.bookingSegmentId === segmentId),
            )
            return (
              <div className="flex flex-wrap items-start gap-3 p-4" key={passenger.bookingPassengerId}>
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  aria-hidden="true"
                >
                  <Accessibility className="size-4" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-sm font-medium">
                    {passenger.firstName} {passenger.lastName}
                  </h3>
                  <p className="text-xs text-muted-foreground capitalize">{passenger.passengerType}</p>
                  {!requests.length && <p className="text-sm text-muted-foreground">No assistance requested</p>}
                  {requests.map((item) => (
                    <div className="flex flex-wrap items-center gap-2 text-sm" key={item.serviceRequestId}>
                      <span className="font-mono text-xs font-semibold">{item.serviceCode}</span>
                      <AssistanceStatus status={item.status} />
                      <span className="text-xs text-muted-foreground">
                        {booking.segments.find((segment) => segment.bookingSegmentId === item.bookingSegmentId)?.flightNumber ??
                          'All flights'}
                      </span>
                      {item.decisionNote && <p className="basis-full text-xs text-muted-foreground">{item.decisionNote}</p>}
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => setPassengerId(passenger.bookingPassengerId)}
                >
                  <Plus aria-hidden="true" />
                  Request assistance
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
      <AssistanceRequestDialog
        open={passengerId !== null}
        onClose={() => setPassengerId(null)}
        passengerName={booking.passengers
          .filter((person) => person.bookingPassengerId === passengerId)
          .map((person) => `${person.firstName} ${person.lastName}`)
          .join('')}
        flightLabel={booking.segments.find((segment) => segment.bookingSegmentId === segmentId)?.flightNumber ?? 'All flights'}
        onSubmit={async (value) => {
          if (!passengerId || !value.serviceCode) return
          await api.createServiceRequest(reference, {
            bookingPassengerId: passengerId,
            bookingSegmentId: segmentId || null,
            serviceCode: value.serviceCode,
            note: value.note || null,
          })
          await reload()
          onChanged()
        }}
      />
    </Card>
  )
}
