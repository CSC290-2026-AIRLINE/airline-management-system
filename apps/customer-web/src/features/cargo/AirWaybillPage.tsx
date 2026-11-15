import { useEffect, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { Loader2, Printer } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
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
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !d) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center">
        <p className="text-sm text-red-600">{error || 'Booking not found.'}</p>
        <Link to="/cargo" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
          ← My cargo
        </Link>
      </div>
    )
  }

  if (!d.awbNumber) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center">
        <p className="text-sm text-slate-600">The Air Waybill is issued when you pay.</p>
        <Link to="/cargo/bookings/$id" params={{ id }} className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700">
          ← Back to shipment
        </Link>
      </div>
    )
  }

  const confirmedEvent = d.timeline.find((e) => e.eventType === 'confirmed')
  const issuedAt = confirmedEvent ? fmtDateTime(confirmedEvent.occurredAt) : fmtDateTime(d.timeline[0]?.occurredAt ?? '')

  return (
    <div className="text-left">
      {/* Top bar — hidden on print */}
      <div className="awb-no-print mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link to="/cargo/bookings/$id" params={{ id }} className="text-sm font-medium text-blue-600 hover:text-blue-700">
          ← Back to shipment
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Document */}
      <div className="awb-doc mx-auto max-w-4xl px-6 pb-12">
        <div className="rounded-xl border border-slate-200 bg-white p-8">
          {/* Header */}
          <div className="mb-6 border-b border-slate-200 pb-4">
            <h1 className="text-xl font-bold text-slate-900">AIR WAYBILL</h1>
            <p className="mt-1 text-sm font-semibold text-slate-700">AWB {fmtAwb(d.awbNumber)}</p>
            <p className="text-xs text-slate-500">Flython Cargo &middot; not negotiable</p>
          </div>

          {/* Compartments */}
          <div className="overflow-hidden rounded-lg border border-slate-300">
            {/* Row 1: Shipper | Consignee */}
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <Cell label="SHIPPER" value={d.shipper.name} sub={dash(d.shipper.phone)} className="sm:border-r" />
              <Cell label="CONSIGNEE" value={d.consignee.name} sub={`${d.consignee.address}\n${dash(d.consignee.phone)}`} />
            </div>
            <div className="border-t border-slate-300" />

            {/* Row 2: Departure | Destination */}
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <Cell label="AIRPORT OF DEPARTURE" value={`${d.flight.origin} — ${d.flight.originName}`} className="sm:border-r" />
              <Cell label="AIRPORT OF DESTINATION" value={`${d.flight.destination} — ${d.flight.destinationName}`} />
            </div>
            <div className="border-t border-slate-300" />

            {/* Row 3: Flight | Booking ref */}
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <Cell label="FLIGHT AND DATE" value={`${d.flight.flightNumber} · ${fmtDateTime(d.flight.depAt)}`} className="sm:border-r" />
              <Cell label="BOOKING REFERENCE" value={d.bookingRef} />
            </div>
            <div className="border-t border-slate-300" />

            {/* Row 4: Pieces | Weight | Volume | Chargeable */}
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <Cell label="PIECES" value={String(d.goods.pieces)} className="border-r border-slate-300" />
              <Cell label="DECLARED WEIGHT" value={fmtWeight(d.goods.declaredWeightKg)} className="sm:border-r sm:border-slate-300" />
              <Cell label="DECLARED VOLUME" value={fmtVolume(d.goods.declaredVolumeM3)} className="border-r border-slate-300" />
              <Cell label="CHARGEABLE WEIGHT" value={fmtWeight(d.quote.chargeableKg)} />
            </div>
            <div className="border-t border-slate-300" />

            {/* Row 5: Nature of goods | Rate | Freight charge */}
            <div className="grid grid-cols-1 sm:grid-cols-3">
              <Cell label="NATURE OF GOODS" value={d.goods.goodsDescription} sub={d.goods.commodityTypeName} className="sm:border-r" />
              <Cell label="RATE" value={fmtMoney(d.quote.currency, d.quote.ratePerKg) + '/kg'} className="sm:border-r" />
              <div className="relative">
                <Cell label="FREIGHT CHARGE" value={fmtMoney(d.quote.currency, d.quote.charge)} />
                <span className="absolute right-3 top-2 rotate-[-8deg] rounded border-2 border-emerald-600 px-2 py-0.5 text-xs font-bold uppercase text-emerald-600 opacity-80">
                  Paid
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">
              Issued when payment was captured, {issuedAt}. The weight and volume measured at the terminal are recorded on the shipment
              timeline; the paid charge does not change.
            </p>
            <p className="mt-2 text-xs font-medium text-slate-600">Issued by Flython Cargo</p>
          </div>
        </div>
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

function Cell({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={`border-slate-300 px-4 py-3 ${className ?? ''}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
