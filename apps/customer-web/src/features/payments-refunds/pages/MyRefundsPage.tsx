import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import type { BadgeVariant } from '@customer-web/features/payments-checkout/receipt-copy'
import { Input } from '@customer-web/components/ui/input'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { useRefundsApi } from '../api/refunds'
import { FilterChips } from '@customer-web/features/payments-checkout/components/FilterChips'
import { RefundRequestDialog } from '../components/RefundRequestDialog'
import { RefundsShell } from '../components/RefundsShell'
import { formatAmount, formatDate } from '../format'
import { MY_REFUND_TABS, type MyRefundDto, type MyRefundListDto, type MyRefundTab, type RefundStatus } from '../types'

const TAB_LABELS: Record<MyRefundTab, string> = { all: 'All', in_progress: 'In progress', refunded: 'Refunded', rejected: 'Rejected' }

/** The badge variant of a state. The words come from the API (`status_label`); only the variant is decided here. */
function badgeVariant(status: RefundStatus): BadgeVariant {
  switch (status) {
    case 'requested':
    case 'pending_approval':
      return 'secondary'
    case 'approved':
    case 'processing':
      return 'warning'
    case 'succeeded':
      return 'success'
    case 'failed':
    case 'rejected':
      return 'destructive'
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
      subtitle="To ask for a new refund, open the receipt in Receipts."
      current="refunds"
      action={
        <Button type="button" onClick={() => setRequesting(true)}>
          Request a refund
        </Button>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          ariaLabel="Refund state"
          value={tab}
          onChange={onTabChange}
          options={MY_REFUND_TABS.map((value) => ({ value, label: TAB_LABELS[value], count: data?.counts[value] }))}
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search booking or refund no."
          aria-label="Search refund or booking"
          className="sm:w-72"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading your refunds…</p>}
      {data?.items.length === 0 && <p className="text-sm text-muted-foreground">No refunds here.</p>}

      <ul className="flex flex-col gap-4">
        {data?.items.map((refund) => (
          <RefundCard key={refund.id} refund={refund} />
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        Refunds to a card take 5–10 working days to show on your statement. The voucher share of a mixed payment comes back as a new
        voucher. Staff approve anything outside the fare rules.
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
        <CardHeader>
          <CardTitle>
            {refund.title} <span className="text-sm font-normal text-muted-foreground">· {refund.reference}</span>
          </CardTitle>
          <CardDescription>
            Booking {refund.booking_reference} · asked {formatDate(refund.requested_at)}
            {refund.completed_at && ` · paid ${formatDate(refund.completed_at)}`}
            {refund.decided_at && ' · Decided by staff'}
          </CardDescription>
          <CardAction className="flex flex-col items-end gap-2">
            <span className="text-lg font-semibold tabular-nums">
              {formatAmount(refund.amount)} {refund.currency}
            </span>
            <Badge variant={badgeVariant(refund.status)}>{refund.status_label}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{refund.outcome_note}</p>
          {(refund.voucher_code || refund.credit_note_number) && (
            <p>
              {refund.voucher_code && (
                <>
                  Voucher <span className="font-mono font-medium text-foreground">{refund.voucher_code}</span> ·{' '}
                  <Link to="/vouchers" className="text-primary underline underline-offset-4">
                    View my vouchers
                  </Link>
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
