import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Input } from '@staff-web/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { useRefundsApi } from '../api/refunds'
import { RefundsFrame } from '../components/RefundsFrame'
import { RefundStatusBadge } from '../components/RefundStatusBadge'
import { formatMoney } from '../format'
import { REFUND_QUEUE_TABS, type RefundQueueListDto, type RefundQueueTab } from '../types'

const TAB_LABELS: Record<RefundQueueTab, string> = { all: 'All', needs_review: 'Needs review', done: 'Done' }

interface RefundQueuePageProps {
  tab: RefundQueueTab
  onTabChange: (tab: RefundQueueTab) => void
}

/** Feature 5b: the staff refund queue (frames 02, 02a, 02b). */
export function RefundQueuePage({ tab, onTabChange }: RefundQueuePageProps) {
  return (
    <RefundsFrame
      screenCode="f5.refund_queue"
      screenName="Refund queue"
      title="Refund queue"
      description="Review refund requests, decide them, and see what has been paid out."
    >
      <Queue tab={tab} onTabChange={onTabChange} />
    </RefundsFrame>
  )
}

function Queue({ tab, onTabChange }: RefundQueuePageProps) {
  const api = useRefundsApi()
  const [search, setSearch] = useState('')
  const [data, setData] = useState<RefundQueueListDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    api
      .listRefundQueue(tab, search)
      .then((result) => {
        if (current) {
          setData(result)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : 'The queue could not be loaded.')
      })
    return () => {
      current = false
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Refund queue" className="flex gap-1 rounded-lg bg-muted p-1">
          {REFUND_QUEUE_TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => onTabChange(value)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                tab === value ? 'bg-[#EAF0FB] text-[#1E3A8A]' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {TAB_LABELS[value]}
              {data && <span className="ml-1.5 text-xs">· {data.counts[value]}</span>}
            </button>
          ))}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search refund or booking"
          aria-label="Search refund or booking"
          className="w-full sm:w-64"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="block">{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Refund</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && !error && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading refunds…
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No refunds here.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((refund) => (
              <TableRow key={refund.id}>
                <TableCell>
                  <Link
                    to="/payments/refunds/$refundId"
                    params={{ refundId: refund.reference }}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {refund.reference}
                  </Link>
                </TableCell>
                <TableCell>{refund.booking_reference}</TableCell>
                <TableCell>{refund.source_label}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(refund.amount, refund.currency)}</TableCell>
                <TableCell>
                  <RefundStatusBadge status={refund.status} label={refund.status_label} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
