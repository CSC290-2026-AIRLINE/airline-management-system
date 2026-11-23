import { useEffect, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { Printer } from 'lucide-react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Separator } from '@customer-web/components/ui/separator'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import { useCustomerCargoApi, type BookingDetail } from './cargo-api'

/* ── Formatting ────────────────────────────────────────────────── */

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

function fmtMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtWeight(kg: number) {
  return `${kg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`
}

function fmtVolume(m3: number) {
  return `${m3.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³`
}

function fmtAwb(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
  return raw
}

function dash(val: string | null | undefined): string {
  return val && val.trim() ? val : '—'
}

/* ── Component ─────────────────────────────────────────────────── */

export default function AirWaybillPage() {
  const { id } = useParams({ from: '/_authenticated/cargo/bookings/$id/waybill' })
  const api = useCustomerCargoApi()
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

  if (loading) {
    return (
      <div className="mx-auto grid max-w-4xl gap-4 px-6 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !d) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Alert variant="destructive">
          <AlertDescription>{error || 'Booking not found.'}</AlertDescription>
        </Alert>
        <Button asChild variant="link" className="mt-3 px-0">
          <Link to="/cargo">← My cargo</Link>
        </Button>
      </div>
    )
  }

  if (!d.awbNumber) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Alert>
          <AlertDescription>The Air Waybill is issued when you pay.</AlertDescription>
        </Alert>
        <Button asChild variant="link" className="mt-3 px-0">
          <Link to="/cargo/bookings/$id" params={{ id }}>
            ← Back to shipment
          </Link>
        </Button>
      </div>
    )
  }

  const confirmedEvent = d.timeline.find((e) => e.eventType === 'confirmed')
  const issuedAt = confirmedEvent ? fmtDateTime(confirmedEvent.occurredAt) : fmtDateTime(d.timeline[0]?.occurredAt ?? '')

  return (
    <div className="text-left">
      {/* Top bar — hidden on print */}
      <div className="awb-no-print mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Button asChild variant="link" className="px-0">
          <Link to="/cargo/bookings/$id" params={{ id }}>
            ← Back to shipment
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Document */}
      <div className="awb-doc mx-auto max-w-4xl px-6 pb-12">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-xl">AIR WAYBILL</CardTitle>
            <CardDescription>
              <span className="block text-sm font-semibold text-foreground">AWB {fmtAwb(d.awbNumber)}</span>
              Flython Cargo &middot; not negotiable
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Compartments */}
            <div className="overflow-hidden rounded-lg border">
              <Row cols="sm:grid-cols-2">
                <Cell label="SHIPPER" value={d.shipper.name} sub={dash(d.shipper.phone)} className="sm:border-r" />
                <Cell label="CONSIGNEE" value={d.consignee.name} sub={`${d.consignee.address}\n${dash(d.consignee.phone)}`} />
              </Row>
              <Row cols="sm:grid-cols-2">
                <Cell label="AIRPORT OF DEPARTURE" value={`${d.flight.origin} — ${d.flight.originName}`} className="sm:border-r" />
                <Cell label="AIRPORT OF DESTINATION" value={`${d.flight.destination} — ${d.flight.destinationName}`} />
              </Row>
              <Row cols="sm:grid-cols-2">
                <Cell label="FLIGHT AND DATE" value={`${d.flight.flightNumber} · ${fmtDateTime(d.flight.depAt)}`} className="sm:border-r" />
                <Cell label="BOOKING REFERENCE" value={d.bookingRef} />
              </Row>
              <Row cols="grid-cols-2 sm:grid-cols-4">
                <Cell label="PIECES" value={String(d.goods.pieces)} className="border-r" />
                <Cell label="DECLARED WEIGHT" value={fmtWeight(d.goods.declaredWeightKg)} className="sm:border-r" />
                <Cell label="DECLARED VOLUME" value={fmtVolume(d.goods.declaredVolumeM3)} className="border-r" />
                <Cell label="CHARGEABLE WEIGHT" value={fmtWeight(d.quote.chargeableKg)} />
              </Row>
              <Row cols="sm:grid-cols-3">
                <Cell label="NATURE OF GOODS" value={d.goods.goodsDescription} sub={d.goods.commodityTypeName} className="sm:border-r" />
                <Cell label="RATE" value={fmtMoney(d.quote.currency, d.quote.ratePerKg) + '/kg'} className="sm:border-r" />
                <Cell label="FREIGHT CHARGE" value={fmtMoney(d.quote.currency, d.quote.charge)} />
              </Row>
            </div>

            {/* Footer */}
            <Separator className="mt-6" />
            <div className="pt-4">
              <p className="text-xs text-muted-foreground">
                Issued when payment was captured, {issuedAt}. The weight and volume measured at the terminal are recorded on the shipment
                timeline; the paid charge does not change.
              </p>
              <p className="mt-2 text-xs font-medium">Issued by Flython Cargo</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .awb-no-print, nav, header, footer { display: none !important; }
          body { background: white !important; }
          .awb-doc { padding: 0 !important; max-width: none !important; }
          .awb-doc > div { border: none !important; border-radius: 0 !important; box-shadow: none !important; }
        }
      `}</style>
    </div>
  )
}

function Row({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <>
      <Separator className="first:hidden" />
      <div className={`grid grid-cols-1 ${cols}`}>{children}</div>
    </>
  )
}

function Cell({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={`px-4 py-3 ${className ?? ''}`}>
      <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs whitespace-pre-line text-muted-foreground">{sub}</p>}
    </div>
  )
}
