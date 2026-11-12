import { useEffect, useState } from 'react'
import { listMyVouchers } from '../api/mock-refunds'
import { RefundsShell } from '../components/RefundsShell'
import { formatAmount, formatDate } from '../format'
import type { MyVoucherDto, MyVoucherListDto } from '../types'

/** The colour of a voucher's state. The words come from the API (`status_label`). */
function badgeClass(voucher: MyVoucherDto): string {
  if (voucher.status === 'active') return voucher.status_label === 'Expiring' ? 'rf-badge rf-badge--warn' : 'rf-badge rf-badge--good'
  if (voucher.status === 'redeemed') return 'rf-badge'
  return 'rf-badge rf-badge--quiet'
}

/** The line under a voucher: when it ends, or what happened to it. */
function endNote(voucher: MyVoucherDto): string {
  if (voucher.status === 'redeemed') return voucher.used_on ?? 'Used'
  if (voucher.status === 'cancelled') return 'This voucher was voided and can no longer be used.'
  if (voucher.status === 'expired') return `Expired ${formatDate(voucher.expires_at)}`
  if (voucher.expires_in_days !== null && voucher.status_label === 'Expiring') return `Expires in ${voucher.expires_in_days} days`
  return `Valid until ${formatDate(voucher.expires_at)}`
}

/** Feature 5b: the customer's vouchers (frame 05). */
export function MyVouchersPage() {
  const [data, setData] = useState<MyVoucherListDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    listMyVouchers()
      .then((result) => {
        if (live) setData(result)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Your vouchers could not be loaded.')
      })
    return () => {
      live = false
    }
  }, [])

  /** Copies the code, so the customer can paste it at checkout. A browser that refuses just leaves the code on screen. */
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
    } catch {
      setCopied(null)
    }
  }

  return (
    <RefundsShell
      title="My vouchers"
      subtitle={data ? `${data.usable} of ${data.total} can be used at checkout.` : 'Vouchers you can use at checkout.'}
      current="vouchers"
    >
      {error && (
        <p role="alert" className="rf-error">
          {error}
        </p>
      )}
      {!data && !error && <p className="rf-empty">Loading your vouchers…</p>}
      {data?.items.length === 0 && <p className="rf-empty">You have no vouchers yet.</p>}

      <ul className="rf-list">
        {data?.items.map((voucher) => (
          <li key={voucher.id} className="rf-card">
            <div className="rf-card-top">
              <div>
                <h2 className="rf-card-title rf-code">{voucher.code}</h2>
                <p className="rf-card-meta">{voucher.description}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="rf-amount">
                  {formatAmount(voucher.amount)} {voucher.currency}
                </div>
                <span className={badgeClass(voucher)}>{voucher.status_label}</span>
              </div>
            </div>
            <p className="rf-note">
              Issued {formatDate(voucher.issued_at)} · {endNote(voucher)}
            </p>
            {voucher.status === 'active' && (
              <div className="rf-actions" style={{ marginTop: 12 }}>
                {/* The checkout is Feature 5a's; the button copies the code to paste there. */}
                <button type="button" className="rf-button rf-button--outline" onClick={() => void copy(voucher.code)}>
                  {copied === voucher.code ? 'Code copied' : 'Use at checkout'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="rf-footnote">A voucher is used once, in full, on one booking. Anything left over is not carried forward.</p>
    </RefundsShell>
  )
}
