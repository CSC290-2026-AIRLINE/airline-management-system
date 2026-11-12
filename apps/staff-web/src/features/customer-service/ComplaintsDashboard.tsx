import { useEffect, useEffectEvent, useState } from 'react'
import { Inbox, Search } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Sheet } from '@staff-web/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { errorMessage, useComplaintsApi } from './api'
import { StatusBadge, TypeLabel } from './ComplaintBadges'
import { ComplaintDetailPanel } from './ComplaintDetailPanel'
import { formatDateTime } from './format'
import { ALL_STATUSES, ALL_TYPES, STATUS_LABEL, TYPE_LABEL, humanize, type CaseStatus, type Complaint, type ComplaintType } from './types'

const REFRESH_MS = 10_000

export function ComplaintsDashboard() {
  const api = useComplaintsApi()
  const [complaints, setComplaints] = useState<Complaint[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<CaseStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<ComplaintType | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Bumped after a change in the drawer, which restarts the effect below and so reloads the list at once.
  const [reloadToken, setReloadToken] = useState(0)

  const fetchList = useEffectEvent(() => api.list())

  // Load now, then poll so new customer complaints show up without a reload.
  useEffect(() => {
    let cancelled = false
    const tick = () =>
      fetchList().then(
        (rows) => {
          if (cancelled) return
          setComplaints(rows)
          setLoadError(null)
        },
        (e: unknown) => {
          if (!cancelled) setLoadError(errorMessage(e))
        },
      )
    void tick()
    const interval = setInterval(() => void tick(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [reloadToken])

  const all = complaints ?? []
  const q = search.trim().toLowerCase()
  const filtered = all.filter((c) => {
    const matchSearch =
      !q || [c.caseNumber, c.passengerName, c.contactEmail ?? '', c.flightNumber ?? ''].some((field) => field.toLowerCase().includes(q))
    const matchStatus = filterStatus === 'all' || c.status === filterStatus
    const matchType = filterType === 'all' || c.type === filterType
    return matchSearch && matchStatus && matchType
  })

  const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, all.filter((c) => c.status === s).length])) as Record<CaseStatus, number>
  const selected = all.find((c) => c.id === selectedId) ?? null

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Complaints</h1>
        <p className="text-sm text-muted-foreground">
          {complaints === null
            ? 'Loading complaints…'
            : `${all.length} total · ${counts.with_supervisor} waiting for a supervisor · refreshes every ${REFRESH_MS / 1000} seconds`}
        </p>
      </header>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription className="block">Could not load complaints: {loadError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {ALL_STATUSES.map((s) => {
          const active = filterStatus === s
          return (
            <Button
              key={s}
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              onClick={() => setFilterStatus(active ? 'all' : s)}
            >
              {STATUS_LABEL[s]}
              <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>{counts[s]}</span>
            </Button>
          )
        })}
      </div>

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              aria-label="Search complaints"
              placeholder="Search by case number, passenger, email or flight"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <NativeSelect
            aria-label="Filter by type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as ComplaintType | 'all')}
            className="sm:w-44"
          >
            <NativeSelectOption value="all">All types</NativeSelectOption>
            {ALL_TYPES.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {TYPE_LABEL[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <CardContent className="p-0">
          {complaints === null && !loadError ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground">Loading complaints…</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold text-foreground">No complaints found</p>
              <p className="text-sm text-muted-foreground">
                {all.length === 0
                  ? 'No complaints have been submitted yet. They will appear here automatically.'
                  : 'Try adjusting your search or filters.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Case</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Complaint</TableHead>
                  <TableHead>Passenger</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">Opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    data-state={c.id === selectedId ? 'selected' : undefined}
                    onClick={() => setSelectedId(c.id)}
                    className={cn('cursor-pointer', c.status === 'with_supervisor' && 'bg-amber-50/60')}
                  >
                    <TableCell className="pl-4">
                      {/* The row is clickable; this button is the keyboard and screen-reader way in. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedId(c.id)
                        }}
                        className="rounded-sm font-mono text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {c.caseNumber}
                      </button>
                    </TableCell>
                    <TableCell>
                      <TypeLabel type={c.type} />
                    </TableCell>
                    <TableCell className="max-w-72">
                      <div className="font-medium">
                        {humanize(c.issue ?? c.location ?? '')}
                        {c.flightNumber && <span className="font-mono font-normal text-muted-foreground"> · {c.flightNumber}</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{c.description}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.passengerName}</div>
                      <div className="text-xs text-muted-foreground">{c.contactEmail}</div>
                    </TableCell>
                    <TableCell className="text-sm">{c.ownerName ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-xs text-muted-foreground">{formatDateTime(c.openedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected && <ComplaintDetailPanel key={selected.id} complaintId={selected.id} onChanged={() => setReloadToken((n) => n + 1)} />}
      </Sheet>
    </div>
  )
}
