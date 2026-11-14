import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, Search, ShieldAlert } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Route } from '@staff-web/routes/_authenticated/cargo/claims'
import type { ClaimFilterStatus } from '@staff-web/routes/_authenticated/cargo/claims'
import { useCargoApi, type ClaimListItem, type ClaimListResult } from './cargo-api'

const STATUS_TABS: { value: ClaimFilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'decided', label: 'Decided' },
]

function claimStatus(item: ClaimListItem): string {
  if (!item.decision) return 'open'
  return item.decision.decision
}

const CLAIM_STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

function ClaimStatusBadge({ status }: { status: string }) {
  const color = CLAIM_STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge variant="outline" className={`border-transparent capitalize ${color}`}>
      {status}
    </Badge>
  )
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

export function ClaimsPage() {
  const { status } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const api = useCargoApi()

  const [result, setResult] = useState<ClaimListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

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
        const data = await api.listClaims({ status, q: debouncedSearch || undefined })
        if (!cancelled) setResult(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load claims')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedSearch])

  const goPage = async (page: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listClaims({ status, q: debouncedSearch || undefined, page })
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load claims')
    } finally {
      setLoading(false)
    }
  }

  const counts = result?.counts ?? { all: 0, open: 0, decided: 0 }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Claims</h1>
        <p className="text-sm text-muted-foreground">Review and decide cargo damage and loss claims.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => {
            const isActive = status === tab.value
            const count = counts[tab.value as keyof typeof counts]
            return (
              <Button
                key={tab.value}
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => {
                  setSearch('')
                  setDebouncedSearch('')
                  navigate({ search: { status: tab.value }, replace: true })
                }}
              >
                {tab.label}
                {count != null && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
              </Button>
            )
          })}
        </div>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search claim ref, booking ref or AWB…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && !result ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : result && result.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldAlert className="size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{debouncedSearch ? 'No claims match your search.' : 'No claims yet.'}</p>
        </div>
      ) : result ? (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim Ref</TableHead>
                  <TableHead>Booking Ref</TableHead>
                  <TableHead>AWB</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Pieces</TableHead>
                  <TableHead className="text-right">Claimed</TableHead>
                  <TableHead>Filed</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((c) => (
                  <ClaimRow key={c.id} claim={c} />
                ))}
              </TableBody>
            </Table>
          </div>

          {result.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {result.page} of {result.totalPages} ({result.total} claims)
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

function ClaimRow({ claim: c }: { claim: ClaimListItem }) {
  const navigate = useNavigate()
  const status = claimStatus(c)

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => navigate({ to: '/cargo/claims/$id', params: { id: c.id }, search: { status: 'all' } })}
    >
      <TableCell className="font-mono text-xs font-medium">{c.claimRef}</TableCell>
      <TableCell className="font-mono text-xs">{c.bookingRef}</TableCell>
      <TableCell className="font-mono text-xs">{c.awbNumber ?? '—'}</TableCell>
      <TableCell className="capitalize">{c.claimType}</TableCell>
      <TableCell className="text-right tabular-nums">{c.piecesAffected}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(c.claimedAmount, c.currency)}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatDateTime(c.filedAt)}</TableCell>
      <TableCell>
        <ClaimStatusBadge status={status} />
      </TableCell>
    </TableRow>
  )
}
