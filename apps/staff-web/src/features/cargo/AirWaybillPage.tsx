import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Separator } from '@staff-web/components/ui/separator'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Route } from '@staff-web/routes/_authenticated/cargo/bookings_.$id.waybill'
import { fmtAwb } from './awb'
import { useCargoApi, type BookingDetail } from './cargo-api'

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-3">
      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-sm font-medium">{value}</span>
      {sub && <span className="text-xs whitespace-pre-line text-muted-foreground">{sub}</span>}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Separator className="first:hidden" />
      <div className="grid grid-cols-1 sm:grid-cols-2 sm:[&>*:first-child]:border-r">{children}</div>
    </>
  )
}

export function AirWaybillPage() {
  const { id } = Route.useParams()
  const api = useCargoApi()
  const [d, setD] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getBookingDetail(id)
      .then(setD)
      .catch(() => setError('Could not load booking.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const back = (
    <Button asChild variant="ghost" size="sm" className="print:hidden">
      <Link to="/cargo/bookings/$id" params={{ id }}>
        <ArrowLeft className="mr-1.5 size-4" />
        Back to booking
      </Link>
    </Button>
  )

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (error || !d) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Alert variant="destructive">
          <AlertDescription>{error || 'Booking not found.'}</AlertDescription>
        </Alert>
      </div>
    )
  }
  if (!d.header.awbNumber) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Alert>
          <AlertDescription>No Air Waybill yet. It is issued when the payment is captured.</AlertDescription>
        </Alert>
      </div>
    )
  }

  const confirmed = d.timeline.find((e) => e.eventType === 'confirmed')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        {back}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 size-4" />
          Print
        </Button>
      </div>

      <Card className="mx-auto w-full max-w-4xl text-left">
        <CardHeader className="border-b">
          <CardTitle className="text-xl">AIR WAYBILL</CardTitle>
          <CardDescription>
            <span className="block font-semibold text-foreground">AWB {fmtAwb(d.header.awbNumber)}</span>
            Flython Cargo · not negotiable{confirmed ? ` · issued ${fmtDateTime(confirmed.occurredAt)}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Row>
              <Cell label="Shipper" value={d.shipper.name} sub={d.shipper.phone ?? '—'} />
              <Cell label="Consignee" value={d.consignee.name} sub={`${d.consignee.address}\n${d.consignee.phone ?? '—'}`} />
            </Row>
            <Row>
              <Cell label="Airport of departure" value={d.flight.origin} />
              <Cell label="Airport of destination" value={d.flight.destination} />
            </Row>
            <Row>
              <Cell label="Flight and date" value={`${d.flight.flightNumber} · ${fmtDateTime(d.flight.depAt)}`} />
              <Cell label="Booking reference" value={d.header.bookingRef} />
            </Row>
            <Row>
              <Cell label="Pieces" value={String(d.goods.pieces)} />
              <Cell
                label="Declared weight and volume"
                value={`${d.goods.declaredWeightKg.toFixed(1)} kg · ${d.goods.declaredVolumeM3.toFixed(3)} m³`}
              />
            </Row>
            <Row>
              <Cell
                label="Nature of goods"
                value={d.goods.goodsDescription}
                sub={`${d.goods.commodityTypeName}${d.goods.unNumber ? ` · ${d.goods.unNumber}` : ''}`}
              />
              <Cell label="Chargeable weight" value={`${d.quote.chargeableKg.toFixed(1)} kg`} />
            </Row>
            <Row>
              <Cell label="Rate" value={`${d.quote.currency} ${d.quote.ratePerKg.toFixed(2)} / kg`} />
              <Cell label="Freight charge (paid)" value={`${d.quote.currency} ${d.quote.charge.toFixed(2)}`} />
            </Row>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
