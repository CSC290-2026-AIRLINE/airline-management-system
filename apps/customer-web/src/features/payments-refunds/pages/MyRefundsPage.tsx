import { useEffect, useState } from 'react'
import { DEMO_REFUND_RECEIPT, listMyRefunds } from '../api/mock-refunds'
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
      return 'rf-badge'
    case 'approved':
    case 'processing':
      return 'rf-badge rf-badge--warn'
    case 'succeeded':
      return 'rf-badge rf-badge--good'
    case 'failed':
    case 'rejected':
      return 'rf-badge rf-badge--bad'
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
  const [search, setSearch] = useState('')
  const [data, setData] = useState<MyRefundListDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    let live = true
    listMyRefunds(tab, search)
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
  }, [tab, search, reload])

  return (
    <RefundsShell title="My refunds" subtitle="Every refund you have asked for, and where it stands." current="refunds">
      <div className="rf-toolbar">
        <div role="tablist" aria-label="Refund state" className="rf-tabs" style={{ margin: 0 }}>
          {MY_REFUND_TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className="rf-tab"
              onClick={() => onTabChange(value)}
            >
              {TAB_LABELS[value]}
              {data && <span> · {data.counts[value]}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="search"
            className="rf-input rf-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search refund or booking"
            aria-label="Search refund or booking"
          />
          <button type="button" className="rf-button" onClick={() => setRequesting(true)}>
            Request a refund
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rf-error">
          {error}
        </p>
      )}
      {!data && !error && <p className="rf-empty">Loading your refunds…</p>}
      {data?.items.length === 0 && <p className="rf-empty">No refunds here.</p>}

      <ul className="rf-list">
        {data?.items.map((refund) => (
          <RefundCard key={refund.id} refund={refund} />
        ))}
      </ul>

      <p className="rf-footnote">Requests inside the fare rules are refunded automatically. Anything else is reviewed by our staff.</p>

      {requesting && (
        <RefundRequestDialog
          receipt={DEMO_REFUND_RECEIPT}
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
    <li className="rf-card">
      <div className="rf-card-top">
        <div>
          <h2 className="rf-card-title">
            {refund.title} <span className="rf-card-meta">· {refund.reference}</span>
          </h2>
          <p className="rf-card-meta">
            Booking {refund.booking_reference} · asked {formatDate(refund.requested_at)}
            {refund.completed_at && ` · paid ${formatDate(refund.completed_at)}`}
            {refund.decided_at && ` · decided ${formatDate(refund.decided_at)}`}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="rf-amount">
            {formatAmount(refund.amount)} {refund.currency}
          </div>
          <span className={badgeClass(refund.status)}>{refund.status_label}</span>
        </div>
      </div>
      <p className="rf-note">{refund.outcome_note}</p>
      {(refund.voucher_code || refund.credit_note_number) && (
        <p className="rf-note">
          {refund.voucher_code && (
            <>
              Voucher <span className="rf-code">{refund.voucher_code}</span>
            </>
          )}
          {refund.voucher_code && refund.credit_note_number && ' · '}
          {refund.credit_note_number && <>Credit note {refund.credit_note_number}</>}
        </p>
      )}
    </li>
  )
}
