import { useEffect, useState } from 'react'
import { Calendar, Loader2, Plane } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { useCargoApi, type FlightManifest, type FlightWithCargo } from './cargo-api'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

const STATUS_COLORS: Record<string, string> = {
  held: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  booked: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  loaded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  in_transit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  arrived: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rebook_required: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge variant="outline" className={`border-transparent ${color}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

export function FlightCargoPage() {
  const api = useCargoApi()
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [flights, setFlights] = useState<FlightWithCargo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null)
  const [manifest, setManifest] = useState<FlightManifest | null>(null)
  const [manifestLoading, setManifestLoading] = useState(false)
  const [manifestError, setManifestError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.listFlightsWithCargo(from, to)
        if (!cancelled) {
          setFlights(data)
          setSelectedFlightId(null)
          setManifest(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load flights')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, tick])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!selectedFlightId) {
        setManifest(null)
        return
      }
      setManifestLoading(true)
      setManifestError(null)
      try {
        const data = await api.getFlightManifest(selectedFlightId)
        if (!cancelled) setManifest(data)
      } catch (e) {
        if (!cancelled) setManifestError(e instanceof Error ? e.message : 'Failed to load manifest')
      } finally {
        if (!cancelled) setManifestLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlightId])

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Flight Cargo</h1>
        <p className="text-sm text-muted-foreground">View cargo load and manifests per flight.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={() => setTick((n) => n + 1)}>
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : flights.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Calendar className="size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No flights in this date range.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flight</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Dep</TableHead>
                <TableHead>Aircraft</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Committed kg</TableHead>
                <TableHead className="text-right">Available kg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flights.map((f) => (
                <TableRow
                  key={f.id}
                  className={`cursor-pointer ${selectedFlightId === f.id ? 'bg-accent' : ''}`}
                  onClick={() => setSelectedFlightId(f.id === selectedFlightId ? null : f.id)}
                >
                  <TableCell className="font-medium">{f.flightNumber}</TableCell>
                  <TableCell>{formatDate(f.serviceDate)}</TableCell>
                  <TableCell>{formatTime(f.depAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{f.aircraft}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {f.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.bookingCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.committedKg.toFixed(1)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${f.availableKg < 0 ? 'font-semibold text-destructive' : ''}`}>
                    {f.availableKg.toFixed(1)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedFlightId && (
        <div className="flex flex-col gap-4">
          {manifestLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : manifestError ? (
            <p className="text-sm text-destructive">{manifestError}</p>
          ) : manifest ? (
            <>
              <CapacityBar manifest={manifest} />
              <ManifestTable manifest={manifest} />
            </>
          ) : null}
        </div>
      )}
    </>
  )
}

function CapacityBar({ manifest }: { manifest: FlightManifest }) {
  const total = manifest.holdLimitKg
  const committedPct = total > 0 ? Math.min((manifest.committedKg / total) * 100, 100) : 0
  const overCapacity = manifest.availableKg < 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Plane className="size-4" />
          {manifest.flightNumber} — {formatDate(manifest.serviceDate)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Committed: <strong className="text-foreground">{manifest.committedKg.toFixed(1)} kg</strong>
            </span>
            <span>
              Hold limit: <strong className="text-foreground">{manifest.holdLimitKg.toFixed(1)} kg</strong>
            </span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all ${overCapacity ? 'bg-destructive' : 'bg-primary'}`}
              style={{ width: `${Math.min(committedPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Available:{' '}
              <strong className={overCapacity ? 'text-destructive' : 'text-foreground'}>{manifest.availableKg.toFixed(1)} kg</strong>
            </span>
            <span>
              Loaded: {manifest.loadedCount} / {manifest.bookedCount} bookings
            </span>
          </div>
        </div>

        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Total declared:</span>{' '}
            <strong className="tabular-nums">{manifest.totalDeclaredKg.toFixed(1)} kg</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Total measured:</span>{' '}
            <strong className="tabular-nums">{manifest.totalMeasuredKg.toFixed(1)} kg</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ManifestTable({ manifest }: { manifest: FlightManifest }) {
  if (manifest.rows.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No cargo bookings on this flight.</p>
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>AWB</TableHead>
            <TableHead>Shipper</TableHead>
            <TableHead>Consignee</TableHead>
            <TableHead>Commodity</TableHead>
            <TableHead>Class</TableHead>
            <TableHead className="text-right">Pcs</TableHead>
            <TableHead className="text-right">Declared kg</TableHead>
            <TableHead className="text-right">Measured kg</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {manifest.rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-mono text-xs">{r.awbNumber ?? '—'}</TableCell>
              <TableCell className="max-w-[140px] truncate">{r.shipperName}</TableCell>
              <TableCell className="max-w-[140px] truncate">{r.consigneeName}</TableCell>
              <TableCell>{r.commodityTypeName}</TableCell>
              <TableCell className="text-xs">{r.handlingClass}</TableCell>
              <TableCell className="text-right tabular-nums">{r.pieces}</TableCell>
              <TableCell className="text-right tabular-nums">{r.declaredWeightKg.toFixed(1)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.measuredWeightKg != null ? r.measuredWeightKg.toFixed(1) : '—'}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
