import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Package, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import {
  useCustomerCargoApi,
  type MyBooking,
  type ClaimListItem,
  type NoticeItem,
  type TrackResult,
  type ClaimableBooking,
} from './cargo-api'
import CargoHero from './CargoHero'

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

type StatusStyle = { bg: string; text: string }
function statusStyle(s: string): StatusStyle {
  switch (s) {
    case 'held':
      return { bg: 'bg-amber-100', text: 'text-amber-800' }
    case 'booked':
    case 'accepted':
    case 'loaded':
    case 'in_transit':
      return { bg: 'bg-blue-100', text: 'text-blue-800' }
    case 'arrived':
      return { bg: 'bg-purple-100', text: 'text-purple-800' }
    case 'delivered':
      return { bg: 'bg-green-100', text: 'text-green-800' }
    case 'rebook_required':
      return { bg: 'bg-red-100', text: 'text-red-800' }
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-600' }
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
  const st = statusStyle(status)
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}>
      {statusLabel(status)}
    </span>
  )
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

  return <span className="text-xs text-slate-500">Hold ends in {remaining}</span>
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

  const tabCls = (t: string) =>
    `pb-3 text-sm font-medium transition-colors border-b-2 ${tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`

  return (
    <div className="text-left">
      <CargoHero subtitle="Your bookings, tracking and claims. Click a reference to open it." />

      <div className="mx-auto w-full max-w-6xl bg-slate-50 px-6 py-8">
        {/* Track */}
        <TrackBox />

        {/* Card with tabs */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          {/* Tab row */}
          <div className="flex gap-6 border-b border-slate-200">
            <button onClick={() => switchTab('bookings')} className={tabCls('bookings')}>
              Bookings
            </button>
            <button onClick={() => switchTab('claims')} className={tabCls('claims')}>
              Claims
            </button>
            <button onClick={() => switchTab('notices')} className={tabCls('notices')}>
              Notices
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className="pt-5">
            {tab === 'bookings' && <BookingsTab />}
            {tab === 'claims' && <ClaimsTab />}
            {tab === 'notices' && <NoticesTab onCountChange={setUnreadCount} />}
          </div>
        </div>
      </div>
    </div>
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
    <div>
      <label className="mb-1 block text-xs text-slate-600">Track a shipment</label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Booking reference or Air Waybill, e.g. CG-XXXXXX or 999-0000001-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          className="h-10 max-w-md flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
        />
        <Button variant="outline" size="sm" className="h-10" onClick={() => void handleSearch()} disabled={searching || !query.trim()}>
          Track
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {result && (
        <div
          className="mt-2 flex cursor-pointer items-center justify-between rounded-md border border-slate-200 p-3 transition-colors hover:bg-slate-50"
          onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: result.bookingId } })}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{result.bookingRef}</span>
            {result.awbNumber && <span className="text-xs text-slate-500">AWB {fmtAwb(result.awbNumber)}</span>}
            <StatusPill status={result.status} />
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
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
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setStatus(f.value)
              setPage(1)
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === f.value ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}

      {!loading && bookings.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12">
          <Package className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No cargo shipments yet.</p>
        </div>
      )}

      {!loading && bookings.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Reference</th>
                  <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Flight</th>
                  <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Goods</th>
                  <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Weight</th>
                  <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Charge</th>
                  <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Status</th>
                  <th className="pb-2 text-xs font-medium uppercase text-slate-500" />
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                    onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
                  >
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-slate-900">{b.bookingRef}</span>
                      <div className="text-xs text-slate-500">
                        {b.status === 'held' ? (
                          <HoldCountdown expiresAt={b.holdExpiresAt} />
                        ) : b.awbNumber ? (
                          `AWB ${fmtAwb(b.awbNumber)}`
                        ) : b.refundAmount ? (
                          `Refunded ${fmtMoney(b.currency, b.refundAmount)}`
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="text-slate-900">
                        {b.flightNumber} · {fmtDate(b.shipDate)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {b.origin} → {b.destination}
                      </div>
                    </td>
                    <td className="max-w-[180px] truncate py-3 pr-4 text-slate-700">{b.goodsDescription}</td>
                    <td className="py-3 pr-4 text-slate-700">{fmtWeight(b.declaredWeightKg)}</td>
                    <td className="py-3 pr-4 text-slate-700">{fmtMoney(b.currency, b.charge)}</td>
                    <td className="py-3 pr-4">
                      <StatusPill status={b.status} />
                      {b.status === 'arrived' && <div className="mt-0.5 text-[11px] text-slate-500">Waiting for the consignee</div>}
                    </td>
                    <td className="py-3">
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="cursor-pointer rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
                onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">{b.bookingRef}</span>
                  <StatusPill status={b.status} />
                </div>
                {b.awbNumber && <p className="text-xs text-slate-500">AWB {fmtAwb(b.awbNumber)}</p>}
                {b.status === 'held' && <HoldCountdown expiresAt={b.holdExpiresAt} />}
                <p className="mt-1 text-sm text-slate-700">
                  {b.flightNumber} · {fmtDate(b.shipDate)} · {b.origin} → {b.destination}
                </p>
                <p className="text-sm text-slate-500">
                  {b.goodsDescription} · {fmtWeight(b.declaredWeightKg)} · {fmtMoney(b.currency, b.charge)}
                </p>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )

  return (
    <div className="space-y-8">
      {/* Claimable */}
      <div>
        <h3 className="font-semibold text-slate-900">Can be claimed</h3>
        <p className="mb-3 text-xs text-slate-500">Delivered shipments within {claimWindowDays} days of delivery · one claim per booking</p>
        {claimable.length === 0 ? (
          <p className="text-sm text-slate-500">No delivered shipments can be claimed right now.</p>
        ) : (
          <div className="space-y-2">
            {claimable.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{b.bookingRef}</div>
                  {b.awbNumber && <div className="text-xs text-slate-500">AWB {fmtAwb(b.awbNumber)}</div>}
                  <div className="mt-1 text-sm text-slate-600">
                    {b.goodsDescription} · {fmtWeight(b.declaredWeightKg)}
                  </div>
                  <div className="text-xs text-slate-500">
                    Delivered {fmtDate(b.deliveredAt)} · {b.flightNumber} {b.origin} → {b.destination}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    Claim by {fmtDate(b.claimDeadline)} · {b.daysLeft} day{b.daysLeft !== 1 ? 's' : ''} left
                  </span>
                  <Button
                    size="sm"
                    className="bg-slate-900 text-white hover:bg-slate-800"
                    onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
                  >
                    File a claim
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Your claims */}
      <div>
        <h3 className="mb-3 font-semibold text-slate-900">Your claims</h3>
        {claims.length === 0 ? (
          <p className="text-sm text-slate-500">You haven&apos;t filed any claims.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Claim</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Booking</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Type</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Claimed</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Filed</th>
                    <th className="pb-2 pr-4 text-xs font-medium uppercase text-slate-500">Decision</th>
                    <th className="pb-2 text-xs font-medium uppercase text-slate-500" />
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                      onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: c.id } })}
                    >
                      <td className="py-3 pr-4 font-semibold text-slate-900">{c.claimRef}</td>
                      <td className="py-3 pr-4 text-slate-700">{c.bookingRef}</td>
                      <td className="py-3 pr-4 text-slate-700">
                        {c.claimType === 'damage' ? 'Damage' : 'Loss'}, {c.piecesAffected} piece{c.piecesAffected !== 1 ? 's' : ''}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{fmtMoney(c.currency, c.claimedAmount)}</td>
                      <td className="py-3 pr-4 text-slate-500">{fmtDate(c.filedAt)}</td>
                      <td className="py-3 pr-4">
                        <ClaimDecisionPill claim={c} />
                      </td>
                      <td className="py-3">
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {claims.map((c) => (
                <div
                  key={c.id}
                  className="cursor-pointer rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
                  onClick={() => void navigate({ to: '/cargo/bookings/$id', params: { id: c.id } })}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{c.claimRef}</span>
                    <ClaimDecisionPill claim={c} />
                  </div>
                  <p className="text-sm text-slate-600">
                    {c.bookingRef} · {c.claimType === 'damage' ? 'Damage' : 'Loss'}, {c.piecesAffected} piece
                    {c.piecesAffected !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtMoney(c.currency, c.claimedAmount)} · Filed {fmtDate(c.filedAt)}
                  </p>
                </div>
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
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        Waiting for the cargo desk
      </span>
    )
  }
  if (claim.decision.decision === 'approved') {
    return (
      <div>
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
          Approved {claim.decision.approvedAmount != null ? fmtMoney(claim.currency, claim.decision.approvedAmount) : ''}
        </span>
        <div className="mt-0.5 text-[11px] text-slate-500">Recorded only, no payment is made by this system.</div>
      </div>
    )
  }
  return <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Rejected</span>
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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )

  if (notices.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-slate-500">No notices yet.</p>
      </div>
    )
  }

  const latest = notices.slice(0, 3)
  const earlier = notices.slice(3)

  return (
    <div>
      {/* Top row */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">Newest first. Messages are shown here only; nothing is emailed.</p>
        {hasUnread && (
          <button onClick={() => void markAllRead()} className="text-xs font-medium text-blue-600 hover:text-blue-800">
            Mark all read
          </button>
        )}
      </div>

      {/* Latest */}
      {latest.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Latest</p>
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Earlier</p>
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
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-slate-50 ${
        isUnread ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'
      }`}
    >
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${nt.bg} ${nt.fg} text-sm`}>{nt.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{notice.title}</span>
          <span className="text-xs text-slate-500">· {notice.bookingRef}</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-600">{notice.message}</p>
        <p className="mt-1 text-xs text-slate-400">{fmtDateTime(notice.notifiedAt)}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">{isUnread && <span className="h-2 w-2 rounded-full bg-blue-500" />}</div>
    </div>
  )
}
