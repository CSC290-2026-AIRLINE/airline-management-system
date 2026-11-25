import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Package, ChevronRight, ChevronLeft } from 'lucide-react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@customer-web/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@customer-web/components/ui/toggle-group'
import {
  useCustomerCargoApi,
  type MyBooking,
  type ClaimListItem,
  type NoticeItem,
  type TrackResult,
  type ClaimableBooking,
} from './cargo-api'
import CargoPage from './CargoPage'

/* ── Formatting helpers ─────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(iso),
  )
}

function fmtMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtWeight(kg: number) {
  return `${kg.toLocaleString('en-US', { maximumFractionDigits: 1 })} kg`
}

function fmtAwb(raw: string | null): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
  return raw
}

/* ── Status helpers ─────────────────────────────────────────────── */

function statusClass(s: string): string {
  switch (s) {
    case 'held':
      return 'bg-amber-100 text-amber-800'
    case 'booked':
    case 'accepted':
    case 'loaded':
    case 'in_transit':
      return 'bg-blue-100 text-blue-800'
    case 'arrived':
      return 'bg-purple-100 text-purple-800'
    case 'delivered':
      return 'bg-green-100 text-green-800'
    case 'rebook_required':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-secondary text-secondary-foreground'
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    held: 'Awaiting payment',
    booked: 'Booked',
    accepted: 'Accepted',
    loaded: 'Loaded',
    in_transit: 'In transit',
    arrived: 'Arrived',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    expired: 'Hold expired',
    rejected: 'Rejected',
    rebook_required: 'Needs a new flight',
  }
  return map[s] ?? s.replace(/_/g, ' ')
}

function StatusPill({ status }: { status: string }) {
  return <Badge className={statusClass(status)}>{statusLabel(status)}</Badge>
}

/* ── Hold countdown ─────────────────────────────────────────────── */

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('')
  const ref = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    function tick() {
      const ms = new Date(expiresAt).getTime() - Date.now()
      if (ms <= 0) {
        setRemaining('expired')
        return
      }
      const m = Math.floor(ms / 60_000)
      const s = Math.floor((ms % 60_000) / 1000)
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`)
    }
    tick()
    ref.current = setInterval(tick, 1000)
    return () => clearInterval(ref.current)
  }, [expiresAt])

  return <span className="text-xs text-muted-foreground">Hold ends in {remaining}</span>
}

/* ── Notice icon helper ─────────────────────────────────────────── */

function noticeType(title: string): { icon: string; bg: string; fg: string } {
  const t = title.toLowerCase()
  if (t.includes('confirmed') || t.includes('booked')) return { icon: '✓', bg: 'bg-blue-100', fg: 'text-blue-700' }
  if (t.includes('loaded')) return { icon: '↑', bg: 'bg-green-100', fg: 'text-green-700' }
  if (t.includes('departed') || t.includes('transit')) return { icon: '✈', bg: 'bg-blue-100', fg: 'text-blue-700' }
  if (t.includes('arrived') || t.includes('delivered')) return { icon: '⌂', bg: 'bg-green-100', fg: 'text-green-700' }
  if (t.includes('refund') || t.includes('cancel')) return { icon: '↩', bg: 'bg-amber-100', fg: 'text-amber-700' }
  if (t.includes('claim')) return { icon: '§', bg: 'bg-purple-100', fg: 'text-purple-700' }
  return { icon: '•', bg: 'bg-slate-100', fg: 'text-slate-600' }
}

/* ── Status filter pills ────────────────────────────────────────── */

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'held', label: 'Awaiting payment' },
  { value: 'booked', label: 'Booked' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'closed', label: 'Cancelled' },
]

/* ── Main component ─────────────────────────────────────────────── */

export default function MyCargoPage() {
  const api = useCustomerCargoApi()
  const params = new URLSearchParams(window.location.search)
  const initialTab = (['bookings', 'claims', 'notices'] as const).includes(params.get('tab') as 'bookings' | 'claims' | 'notices')
    ? (params.get('tab') as 'bookings' | 'claims' | 'notices')
    : 'bookings'
  const [tab, setTab] = useState<'bookings' | 'claims' | 'notices'>(initialTab)
  const [unreadCount, setUnreadCount] = useState(0)

  function switchTab(t: 'bookings' | 'claims' | 'notices') {
    setTab(t)
    window.history.replaceState(null, '', `?tab=${t}`)
  }

  useEffect(() => {
    api
      .listMyNotices({ page: 1, pageSize: 1 })
      .then((r) => setUnreadCount(r.unreadCount))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <CargoPage subtitle="Your bookings, tracking and claims. Click a reference to open it." unreadCount={unreadCount}>
      {/* Track */}
      <TrackBox />

      {/* Card with tabs */}
      <Card className="mt-6">
        <CardContent>
          <Tabs value={tab} onValueChange={(t) => switchTab(t as 'bookings' | 'claims' | 'notices')}>
            <TabsList variant="line" className="w-full justify-start gap-6 border-b">
              <TabsTrigger value="bookings" className="flex-none px-0">
                Bookings
              </TabsTrigger>
              <TabsTrigger value="claims" className="flex-none px-0">
                Claims
              </TabsTrigger>
              <TabsTrigger value="notices" className="flex-none px-0">
                Notices
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="h-4 min-w-4 justify-center px-1 text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Tab content */}
          <div className="pt-5">
            {tab === 'bookings' && <BookingsTab />}
            {tab === 'claims' && <ClaimsTab />}
            {tab === 'notices' && <NoticesTab onCountChange={setUnreadCount} />}
          </div>
        </CardContent>
      </Card>
    </CargoPage>
  )
}

/* ── Track box ──────────────────────────────────────────────────── */

function TrackBox() {
  const api = useCustomerCargoApi()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<TrackResult | null>(null)
  const [error, setError] = useState('')

  async function handleSearch() {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError('')
    setResult(null)
    try {
      const isAwb = /^\d{3}-?\d{7,8}-?\d$/.test(q)
      const r = await api.trackBooking(isAwb ? { awb: q.replace(/-/g, '') } : { ref: q })
      setResult(r)
    } catch {
      setError('Not found')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="track">Track a shipment</Label>
      <div className="flex gap-2">
        <Input
          id="track"
          type="text"
          placeholder="Booking reference or Air Waybill, e.g. CG-XXXXXX or 999-0000001-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          className="max-w-md flex-1"
        />
        <Button variant="outline" onClick={() => void handleSearch()} disabled={searching || !query.trim()}>
          Track
        </Button>
      </div>
      {error && (
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Card
          className="cursor-pointer py-3 transition-colors hover:bg-muted/50"
          onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: result.bookingId } })}
        >
          <CardContent className="flex items-center justify-between px-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{result.bookingRef}</span>
              {result.awbNumber && <span className="text-xs text-muted-foreground">AWB {fmtAwb(result.awbNumber)}</span>}
              <StatusPill status={result.status} />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ── Bookings tab ───────────────────────────────────────────────── */

function BookingsTab() {
  const api = useCustomerCargoApi()
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [bookings, setBookings] = useState<MyBooking[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.listMyBookings({ status: status !== 'all' ? status : undefined, page })
      setBookings(r.data)
      setTotal(r.total)
      setTotalPages(r.totalPages)
    } catch {
      // ignore
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
    <>
      {/* Filter pills */}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={2}
        value={status}
        onValueChange={(v) => {
          if (!v) return
          setStatus(v)
          setPage(1)
        }}
        className="mb-4 flex-wrap"
        aria-label="Filter by status"
      >
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="rounded-full px-3 text-xs">
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {loading && (
        <div className="grid gap-2 py-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {!loading && bookings.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Package className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No cargo shipments yet.</p>
        </div>
      )}

      {!loading && bookings.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Flight</TableHead>
                  <TableHead>Goods</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Charge</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer"
                    onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
                  >
                    <TableCell>
                      <span className="font-semibold">{b.bookingRef}</span>
                      <div className="text-xs text-muted-foreground">
                        {b.status === 'held' ? (
                          <HoldCountdown expiresAt={b.holdExpiresAt} />
                        ) : b.awbNumber ? (
                          `AWB ${fmtAwb(b.awbNumber)}`
                        ) : b.refundAmount ? (
                          `Refunded ${fmtMoney(b.currency, b.refundAmount)}`
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {b.flightNumber} · {fmtDate(b.shipDate)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.origin} → {b.destination}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{b.goodsDescription}</TableCell>
                    <TableCell>{fmtWeight(b.declaredWeightKg)}</TableCell>
                    <TableCell>{fmtMoney(b.currency, b.charge)}</TableCell>
                    <TableCell>
                      <StatusPill status={b.status} />
                      {b.status === 'arrived' && <div className="mt-0.5 text-[11px] text-muted-foreground">Waiting for the consignee</div>}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {bookings.map((b) => (
              <Card
                key={b.id}
                className="cursor-pointer gap-1 py-4 transition-colors hover:bg-muted/50"
                onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
              >
                <CardContent className="grid gap-1 px-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{b.bookingRef}</span>
                    <StatusPill status={b.status} />
                  </div>
                  {b.awbNumber && <p className="text-xs text-muted-foreground">AWB {fmtAwb(b.awbNumber)}</p>}
                  {b.status === 'held' && <HoldCountdown expiresAt={b.holdExpiresAt} />}
                  <p className="mt-1 text-sm">
                    {b.flightNumber} · {fmtDate(b.shipDate)} · {b.origin} → {b.destination}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {b.goodsDescription} · {fmtWeight(b.declaredWeightKg)} · {fmtMoney(b.currency, b.charge)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="mr-1 h-3 w-3" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

/* ── Claims tab ─────────────────────────────────────────────────── */

function ClaimsTab() {
  const api = useCustomerCargoApi()
  const navigate = useNavigate()
  const [claimable, setClaimable] = useState<ClaimableBooking[]>([])
  const [claimWindowDays, setClaimWindowDays] = useState(14)
  const [claims, setClaims] = useState<ClaimListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [cl, cr] = await Promise.all([api.listClaimable(), api.listMyClaims({})])
        if (!cancelled) {
          setClaimable(cl.data)
          setClaimWindowDays(cl.claimWindowDays)
          setClaims(cr.data)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading)
    return (
      <div className="grid gap-2 py-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )

  return (
    <div className="space-y-8">
      {/* Claimable */}
      <div>
        <h3 className="font-semibold">Can be claimed</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Delivered shipments within {claimWindowDays} days of delivery · one claim per booking
        </p>
        {claimable.length === 0 ? (
          <p className="text-sm text-muted-foreground">No delivered shipments can be claimed right now.</p>
        ) : (
          <div className="space-y-2">
            {claimable.map((b) => (
              <Card key={b.id} className="py-4">
                <CardContent className="flex flex-wrap items-center gap-4 px-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{b.bookingRef}</div>
                    {b.awbNumber && <div className="text-xs text-muted-foreground">AWB {fmtAwb(b.awbNumber)}</div>}
                    <div className="mt-1 text-sm text-muted-foreground">
                      {b.goodsDescription} · {fmtWeight(b.declaredWeightKg)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Delivered {fmtDate(b.deliveredAt)} · {b.flightNumber} {b.origin} → {b.destination}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-amber-100 text-amber-800">
                      Claim by {fmtDate(b.claimDeadline)} · {b.daysLeft} day{b.daysLeft !== 1 ? 's' : ''} left
                    </Badge>
                    <Button size="sm" onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}>
                      File a claim
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Your claims */}
      <div>
        <h3 className="mb-3 font-semibold">Your claims</h3>
        {claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven&apos;t filed any claims.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Claimed</TableHead>
                    <TableHead>Filed</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: c.bookingId } })}
                    >
                      <TableCell className="font-semibold">{c.claimRef}</TableCell>
                      <TableCell>{c.bookingRef}</TableCell>
                      <TableCell>
                        {c.claimType === 'damage' ? 'Damage' : 'Loss'}, {c.piecesAffected} piece{c.piecesAffected !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell>{fmtMoney(c.currency, c.claimedAmount)}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(c.filedAt)}</TableCell>
                      <TableCell>
                        <ClaimDecisionPill claim={c} />
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {claims.map((c) => (
                <Card
                  key={c.id}
                  className="cursor-pointer gap-1 py-4 transition-colors hover:bg-muted/50"
                  onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: c.bookingId } })}
                >
                  <CardContent className="grid gap-1 px-4">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{c.claimRef}</span>
                      <ClaimDecisionPill claim={c} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {c.bookingRef} · {c.claimType === 'damage' ? 'Damage' : 'Loss'}, {c.piecesAffected} piece
                      {c.piecesAffected !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtMoney(c.currency, c.claimedAmount)} · Filed {fmtDate(c.filedAt)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ClaimDecisionPill({ claim }: { claim: ClaimListItem }) {
  if (!claim.decision) {
    return <Badge className="bg-amber-100 text-amber-800">Waiting for the cargo desk</Badge>
  }
  if (claim.decision.decision === 'approved') {
    return (
      <div>
        <Badge className="bg-green-100 text-green-800">
          Approved {claim.decision.approvedAmount != null ? fmtMoney(claim.currency, claim.decision.approvedAmount) : ''}
        </Badge>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Recorded only, no payment is made by this system.</div>
      </div>
    )
  }
  return <Badge className="bg-red-100 text-red-800">Rejected</Badge>
}

/* ── Notices tab ─────────────────────────────────────────────────── */

function NoticesTab({ onCountChange }: { onCountChange: (n: number) => void }) {
  const api = useCustomerCargoApi()
  const navigate = useNavigate()
  const [notices, setNotices] = useState<NoticeItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await api.listMyNotices({ pageSize: 100 })
        if (!cancelled) setNotices(r.data)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasUnread = notices.some((n) => !n.readAt)

  async function markAllRead() {
    try {
      await api.markAllNoticesRead()
      setNotices((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })))
      onCountChange(0)
    } catch {
      // ignore
    }
  }

  async function handleClick(notice: NoticeItem) {
    if (!notice.readAt) {
      try {
        await api.markNoticeRead(notice.id)
        setNotices((prev) => prev.map((n) => (n.id === notice.id ? { ...n, readAt: new Date().toISOString() } : n)))
        onCountChange(Math.max(0, notices.filter((n) => !n.readAt).length - 1))
      } catch {
        // ignore
      }
    }
    void navigate({ to: '/cargo/bookings/$id', params: { id: notice.bookingId } })
  }

  if (loading)
    return (
      <div className="grid gap-2 py-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )

  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-muted-foreground">No notices yet.</p>
      </div>
    )
  }

  const latest = notices.slice(0, 3)
  const earlier = notices.slice(3)

  return (
    <div>
      {/* Top row */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Newest first. Messages are shown here only; nothing is emailed.</p>
        {hasUnread && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        )}
      </div>

      {/* Latest */}
      {latest.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latest</p>
          <div className="space-y-2">
            {latest.map((n) => (
              <NoticeRow key={n.id} notice={n} onClick={() => void handleClick(n)} />
            ))}
          </div>
        </div>
      )}

      {/* Earlier */}
      {earlier.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Earlier</p>
          <div className="space-y-2">
            {earlier.map((n) => (
              <NoticeRow key={n.id} notice={n} onClick={() => void handleClick(n)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NoticeRow({ notice, onClick }: { notice: NoticeItem; onClick: () => void }) {
  const nt = noticeType(notice.title)
  const isUnread = !notice.readAt

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer py-4 transition-colors hover:bg-muted/50 ${isUnread ? 'border-blue-300 bg-blue-50/40' : ''}`}
    >
      <CardContent className="flex items-start gap-3 px-4">
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${nt.bg} ${nt.fg} text-sm`}>{nt.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{notice.title}</span>
            <span className="text-xs text-muted-foreground">· {notice.bookingRef}</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{notice.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(notice.notifiedAt)}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">{isUnread && <span className="h-2 w-2 rounded-full bg-blue-500" />}</div>
      </CardContent>
    </Card>
  )
}
