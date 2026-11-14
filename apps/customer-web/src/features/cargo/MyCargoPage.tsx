import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Package, Plus } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { Badge } from '@customer-web/components/ui/badge'
import { useCustomerCargoApi, type MyBooking } from './cargo-api'

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'held', label: 'Held' },
  { value: 'booked', label: 'Booked' },
  { value: 'accepted', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'closed', label: 'Closed' },
]

function statusVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'held':
      return 'outline'
    case 'booked':
    case 'accepted':
    case 'loaded':
    case 'in_transit':
    case 'arrived':
      return 'default'
    case 'delivered':
      return 'secondary'
    case 'cancelled':
    case 'expired':
    case 'rejected':
      return 'destructive'
    default:
      return 'outline'
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function MyCargoPage() {
  const api = useCustomerCargoApi()
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [bookings, setBookings] = useState<MyBooking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.listMyBookings({ status: status !== 'all' ? status : undefined, page })
      setBookings(result.data)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">My Cargo</h1>
        <Button asChild>
          <Link to="/cargo/ship">
            <Plus className="mr-1 h-4 w-4" /> Ship cargo
          </Link>
        </Button>
      </div>

      {/* Status filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => {
              setStatus(s.value)
              setPage(1)
            }}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              status === s.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && bookings.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Package className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No cargo shipments yet.</p>
            <Button asChild variant="outline">
              <Link to="/cargo/ship">Ship your first cargo</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mobile: cards */}
      {!loading && bookings.length > 0 && (
        <>
          <div className="grid gap-3 md:hidden">
            {bookings.map((b) => (
              <Card
                key={b.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
              >
                <CardContent className="grid gap-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.bookingRef}</span>
                    <Badge variant={statusVariant(b.status)}>{statusLabel(b.status)}</Badge>
                  </div>
                  {b.awbNumber && <p className="text-xs text-muted-foreground">AWB {b.awbNumber}</p>}
                  <p className="text-sm">
                    {b.origin} → {b.destination} · {b.flightNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {b.commodityTypeName} · {b.pieces} pcs · {b.currency} {b.charge.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Ref</th>
                  <th className="py-2 pr-3 font-medium">AWB</th>
                  <th className="py-2 pr-3 font-medium">Route</th>
                  <th className="py-2 pr-3 font-medium">Flight</th>
                  <th className="py-2 pr-3 font-medium">Commodity</th>
                  <th className="py-2 pr-3 text-right font-medium">Charge</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                    onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
                  >
                    <td className="py-2 pr-3 font-medium">{b.bookingRef}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{b.awbNumber ?? '—'}</td>
                    <td className="py-2 pr-3">
                      {b.origin} → {b.destination}
                    </td>
                    <td className="py-2 pr-3">
                      {b.flightNumber} · {new Date(b.shipDate).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-3">{b.commodityTypeName}</td>
                    <td className="py-2 pr-3 text-right">
                      {b.currency} {b.charge.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={statusVariant(b.status)}>{statusLabel(b.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
