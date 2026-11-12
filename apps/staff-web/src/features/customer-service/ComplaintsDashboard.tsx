import { useEffect, useState } from 'react'
import { Flag, Inbox, Search } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Sheet } from '@staff-web/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import type { Complaint, ComplaintCategory, ComplaintStatus } from './types'
import { loadComplaints, updateComplaint } from './types'
import { CategoryLabel, StatusBadge } from './ComplaintBadges'
import { ComplaintDetailPanel } from './ComplaintDetailPanel'
import { formatDateTime } from './format'

const ALL_STATUSES: ComplaintStatus[] = ['Pending', 'In Review', 'Escalated', 'Resolved', 'Closed']
const ALL_CATEGORIES: ComplaintCategory[] = ['Employee', 'Flight', 'Food']
const REFRESH_MS = 2000

export function ComplaintsDashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>(loadComplaints)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | 'All'>('All')
  const [filterCategory, setFilterCategory] = useState<ComplaintCategory | 'All'>('All')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Poll localStorage so new customer submissions appear automatically.
  useEffect(() => {
    const interval = setInterval(() => setComplaints(loadComplaints()), REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  // Derived from the list, so the open panel picks up changes from the poll too.
  const selected = complaints.find((c) => c.id === selectedId) ?? null

  function handleUpdate(updated: Complaint) {
    updateComplaint(updated)
    setComplaints(loadComplaints())
  }

  const q = search.trim().toLowerCase()
  const filtered = complaints.filter((c) => {
    const matchSearch =
      !q ||
      c.id.toLowerCase().includes(q) ||
      c.passengerName.toLowerCase().includes(q) ||
      c.passengerEmail.toLowerCase().includes(q) ||
      c.bookingRef.toLowerCase().includes(q) ||
      c.flightNumber.toLowerCase().includes(q)
    const matchStatus = filterStatus === 'All' || c.status === filterStatus
    const matchCategory = filterCategory === 'All' || c.category === filterCategory
    return matchSearch && matchStatus && matchCategory
  })

  const counts = Object.fromEntries(ALL_STATUSES.map((s) => [s, complaints.filter((c) => c.status === s).length])) as Record<
    ComplaintStatus,
    number
  >

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Complaints</h1>
        <p className="text-sm text-muted-foreground">
          {complaints.length} total · {counts.Pending} pending · refreshes every {REFRESH_MS / 1000} seconds
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {ALL_STATUSES.map((s) => {
          const active = filterStatus === s
          return (
            <Button
              key={s}
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              onClick={() => setFilterStatus(active ? 'All' : s)}
            >
              {s}
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
              placeholder="Search by case ID, name, email, booking ref or flight"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <NativeSelect
            aria-label="Filter by category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ComplaintCategory | 'All')}
            className="sm:w-44"
          >
            <NativeSelectOption value="All">All categories</NativeSelectOption>
            {ALL_CATEGORIES.map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold text-foreground">No complaints found</p>
              <p className="text-sm text-muted-foreground">
                {complaints.length === 0
                  ? 'No complaints have been submitted yet. They will appear here automatically.'
                  : 'Try adjusting your search or filters.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Case ID</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Passenger</TableHead>
                  <TableHead>Flight</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    data-state={c.id === selectedId ? 'selected' : undefined}
                    onClick={() => setSelectedId(c.id)}
                    className={cn('cursor-pointer', c.status === 'Pending' && 'bg-amber-50/60')}
                  >
                    <TableCell className="pl-4">
                      {/* The row is clickable; this button is the keyboard and screen-reader way in. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedId(c.id)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-sm font-mono text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {c.supervisorInvolved && (
                          <>
                            <Flag className="size-3.5 text-red-600" aria-hidden="true" />
                            <span className="sr-only">Supervisor involved, </span>
                          </>
                        )}
                        {c.id}
                      </button>
                    </TableCell>
                    <TableCell>
                      <CategoryLabel category={c.category} />
                    </TableCell>
                    <TableCell className="max-w-64 truncate font-medium">{c.subject}</TableCell>
                    <TableCell>
                      <div className="font-medium">{c.passengerName}</div>
                      <div className="text-xs text-muted-foreground">{c.passengerEmail}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono">{c.flightNumber}</div>
                      <div className="text-xs text-muted-foreground">{c.flightDate}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-xs text-muted-foreground">{formatDateTime(c.submittedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected && <ComplaintDetailPanel complaint={selected} onUpdate={handleUpdate} />}
      </Sheet>
    </div>
  )
}
