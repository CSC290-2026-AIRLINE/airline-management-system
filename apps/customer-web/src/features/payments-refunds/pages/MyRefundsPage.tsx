import { useEffect, useState } from 'react'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { cn } from '@customer-web/lib/utils'
import { useRefundsApi } from '../api/refunds'
import { FilterChips } from '@customer-web/features/payments-checkout/components/FilterChips'
import { RefundRequestDialog } from '../components/RefundRequestDialog'
import { RefundsShell } from '../components/RefundsShell'
import { formatAmount, formatDate } from '../format'
import { MY_REFUND_TABS, type MyRefundDto, type MyRefundListDto, type MyRefundTab, type RefundStatus } from '../types'

const TAB_LABELS: Record<MyRefundTab, string> = { all: 'All', in_progress: 'In progress', refunded: 'Refunded', rejected: 'Rejected' }

/** The colour of a state. The words come from the API (`status_label`); only the colour is decided here. */
function badgeClass(status: RefundStatus): string {
  switch (status) {
    case 'requested':
    case 'pending_approval':
      return 'bg-[#EAF0FB] text-navy'
    case 'approved':
    case 'processing':
      return 'bg-warning-soft text-warning'
    case 'succeeded':
      return 'bg-success-soft text-success-strong'
    case 'failed':
    case 'rejected':
      return 'bg-danger-soft text-danger'
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

interface MyRefundsPageProps {
  tab: MyRefundTab
  onTabChange: (tab: MyRefundTab) => void
}

/** Feature 5b: the customer's refunds (frames 04 to 04c). */
export function MyRefundsPage({ tab, onTabChange }: MyRefundsPageProps) {
  const api = useRefundsApi()
  const [search, setSearch] = useState('')
  const [data, setData] = useState<MyRefundListDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    let live = true
    api
      .listMyRefunds(tab, search)
      .then((result) => {
        if (!live) return
        setData(result)
        setError(null)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Your refunds could not be loaded.')
      })
    return () => {
      live = false
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, reload])

  return (
    <RefundsShell
      title="My refunds"
      subtitle="Every refund you have asked for, and where it stands."
      current="refunds"
      action={
        <Button type="button" onClick={() => setRequesting(true)}>
          Request a refund
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          ariaLabel="Refund state"
          value={tab}
          onChange={onTabChange}
          options={MY_REFUND_TABS.map((value) => ({ value, label: TAB_LABELS[value], count: data?.counts[value] }))}
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search refund or booking"
          aria-label="Search refund or booking"
          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:w-72"
        />
      </div>

      {error && (
        <Card className="border-danger-line/40 bg-danger-soft" role="alert">
          <CardContent className="text-sm text-danger">{error}</CardContent>
        </Card>
      )}
      {!data && !error && <p className="py-8 text-center text-sm text-muted-foreground">Loading your refunds…</p>}
      {data?.items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No refunds here.</p>}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {data?.items.map((refund) => (
          <RefundCard key={refund.id} refund={refund} />
        ))}
      </ul>

      <p className="mt-6 text-sm text-muted-foreground">
        Requests inside the fare rules are refunded automatically. Anything else is reviewed by our staff.
      </p>

      {requesting && (
        <RefundRequestDialog
          onClose={() => setRequesting(false)}
          onSent={() => setReload((n) => n + 1)}
          onViewRefunds={() => {
            setRequesting(false)
            onTabChange('all')
          }}
        />
      )}
    </RefundsShell>
  )
}

function RefundCard({ refund }: { refund: MyRefundDto }) {
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-lg font-semibold text-foreground">
                {refund.title} <span className="text-sm font-normal text-muted-foreground">· {refund.reference}</span>
              </h2>
              <p className="m-0 mt-0.5 text-sm text-muted-foreground">
                Booking {refund.booking_reference} · asked {formatDate(refund.requested_at)}
                {refund.completed_at && ` · paid ${formatDate(refund.completed_at)}`}
                {refund.decided_at && ` · decided ${formatDate(refund.decided_at)}`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-xl font-bold text-foreground tabular-nums">
                {formatAmount(refund.amount)} {refund.currency}
              </span>
              <Badge className={cn('border-0', badgeClass(refund.status))}>{refund.status_label}</Badge>
            </div>
          </div>
          <p className="m-0 text-sm text-muted-foreground">{refund.outcome_note}</p>
          {(refund.voucher_code || refund.credit_note_number) && (
            <p className="m-0 text-sm text-muted-foreground">
              {refund.voucher_code && (
                <>
                  Voucher <span className="font-mono font-semibold text-foreground">{refund.voucher_code}</span>
                </>
              )}
              {refund.voucher_code && refund.credit_note_number && ' · '}
              {refund.credit_note_number && <>Credit note {refund.credit_note_number}</>}
            </p>
          )}
        </CardContent>
      </Card>
    </li>
  )
}
