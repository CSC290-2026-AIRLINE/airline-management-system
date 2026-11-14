import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Package, Search } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Route } from '@staff-web/routes/_authenticated/cargo/bookings'
import type { CargoDeskStatus } from '@staff-web/routes/_authenticated/cargo/bookings'
import { useCargoApi, type DeskBooking, type DeskListResult } from './cargo-api'

const STATUS_TABS: { value: CargoDeskStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'held', label: 'Held' },
  { value: 'booked', label: 'Booked' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'loaded', label: 'Loaded' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'rebook_required', label: 'Rebook needed' },
  { value: 'closed', label: 'Closed' },
]

const STATUS_COLORS: Record<string, string> = {
  held: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  booked: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  loaded: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  in_transit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  arrived: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rebook_required: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function CargoDeskPage() {
  const { status } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const api = useCargoApi()

  const [result, setResult] = useState<DeskListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.listBookings({ status, q: debouncedSearch || undefined })
        if (!cancelled) setResult(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load bookings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedSearch, tick])

  const reload = () => setTick((n) => n + 1)

  const goPage = async (page: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listBookings({ status, q: debouncedSearch || undefined, page })
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  const counts = result?.counts ?? {}

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Cargo Desk</h1>
        <p className="text-sm text-muted-foreground">Manage cargo bookings, track shipments and process milestones.</p>
      </div>

      {import.meta.env.DEV && <TestToolsCard onCreated={reload} />}

      <Tabs
        value={status}
        onValueChange={(v) => {
          setSearch('')
          setDebouncedSearch('')
          navigate({ search: { status: v as CargoDeskStatus }, replace: true })
        }}
        className="flex flex-col gap-4"
      >
        <TabsList variant="line" className="flex-wrap gap-1">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-1.5 text-sm font-medium">
              {tab.label}
              {counts[tab.value] != null && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums text-muted-foreground">
                  {counts[tab.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by ref, AWB, shipper or consignee…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !result ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : result && result.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Package className="size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{debouncedSearch ? 'No bookings match your search.' : 'No bookings yet.'}</p>
          {import.meta.env.DEV && !debouncedSearch && (
            <p className="text-xs text-muted-foreground">Use the test tools above to create sample bookings.</p>
          )}
        </div>
      ) : result ? (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref</TableHead>
                  <TableHead>AWB</TableHead>
                  <TableHead>Shipper</TableHead>
                  <TableHead>Consignee</TableHead>
                  <TableHead>Flight</TableHead>
                  <TableHead>Commodity</TableHead>
                  <TableHead className="text-right">Pcs</TableHead>
                  <TableHead className="text-right">Chg. kg</TableHead>
                  <TableHead className="text-right">Charge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Booked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </TableBody>
            </Table>
          </div>

          {result.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {result.page} of {result.totalPages} ({result.total} bookings)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={result.page <= 1 || loading} onClick={() => goPage(result.page - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={result.page >= result.totalPages || loading}
                  onClick={() => goPage(result.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </>
  )
}

function BookingRow({ booking: b }: { booking: DeskBooking }) {
  const navigate = useNavigate()

  return (
    <TableRow className="cursor-pointer" onClick={() => navigate({ to: `/cargo/bookings/${b.id}` as string })}>
      <TableCell className="font-mono text-xs font-medium">{b.bookingRef}</TableCell>
      <TableCell className="font-mono text-xs">{b.awbNumber ?? '—'}</TableCell>
      <TableCell className="max-w-[140px] truncate">{b.shipperName}</TableCell>
      <TableCell className="max-w-[140px] truncate">{b.consigneeName}</TableCell>
      <TableCell>
        <span className="font-medium">{b.flightNumber}</span>
        <span className="ml-1 text-xs text-muted-foreground">{formatDate(b.flightServiceDate)}</span>
      </TableCell>
      <TableCell>{b.commodityTypeName}</TableCell>
      <TableCell className="text-right tabular-nums">{b.pieces}</TableCell>
      <TableCell className="text-right tabular-nums">{b.quotedChargeableKg.toFixed(1)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(b.quotedCharge, b.currency)}</TableCell>
      <TableCell>
        <StatusBadge status={b.status} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatDateTime(b.bookedAt)}</TableCell>
    </TableRow>
  )
}

function TestToolsCard({ onCreated }: { onCreated: () => void }) {
  const api = useCargoApi()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    setMsg(null)
    try {
      const m = await action()
      setMsg(m)
      onCreated()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Test Tools (dev only)</CardTitle>
        <CardDescription className="text-xs">Seed flights and bookings for development.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api.createTestFlights()
              return r.error ?? `Created ${r.created?.length ?? 0} flights`
            })
          }
        >
          {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
          Create test flights
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api.createTestBookings(3)
              if (r.error) return r.error
              return `Created ${r.created?.length ?? 0} bookings`
            })
          }
        >
          {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
          Create test bookings (×3)
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </CardContent>
    </Card>
  )
}
