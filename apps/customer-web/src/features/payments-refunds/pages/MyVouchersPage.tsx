import { useEffect, useState } from 'react'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { cn } from '@customer-web/lib/utils'
import { useRefundsApi } from '../api/refunds'
import { RefundsShell } from '../components/RefundsShell'
import { formatAmount, formatDate } from '../format'
import type { MyVoucherDto, MyVoucherListDto } from '../types'

/** The colour of a voucher's state. The words come from the API (`status_label`). */
function badgeClass(voucher: MyVoucherDto): string {
  if (voucher.status === 'active') {
    return voucher.status_label === 'Expiring' ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success-strong'
  }
  if (voucher.status === 'redeemed') return 'bg-[#EAF0FB] text-navy'
  return 'bg-muted text-muted-foreground'
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
  const api = useRefundsApi()
  const [data, setData] = useState<MyVoucherListDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api
      .listMyVouchers()
      .then((result) => {
        if (live) setData(result)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Your vouchers could not be loaded.')
      })
    return () => {
      live = false
    }
    // `api` is rebuilt every render, so it stays out of the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <Card className="border-danger-line/40 bg-danger-soft" role="alert">
          <CardContent className="text-sm text-danger">{error}</CardContent>
        </Card>
      )}
      {!data && !error && <p className="py-8 text-center text-sm text-muted-foreground">Loading your vouchers…</p>}
      {data?.items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">You have no vouchers yet.</p>}

      <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((voucher) => (
          <li key={voucher.id}>
            <Card className="h-full">
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="m-0 font-mono text-base font-semibold tracking-wide text-foreground">{voucher.code}</h2>
                  <Badge className={cn('border-0', badgeClass(voucher))}>{voucher.status_label}</Badge>
                </div>
                <p className="m-0 text-3xl font-bold text-foreground tabular-nums">
                  {formatAmount(voucher.amount)} <span className="text-base font-medium text-muted-foreground">{voucher.currency}</span>
                </p>
                <p className="m-0 text-sm text-muted-foreground">{voucher.description}</p>
                <p className="m-0 text-sm text-muted-foreground">
                  Issued {formatDate(voucher.issued_at)} · {endNote(voucher)}
                </p>
                {voucher.status === 'active' && (
                  <div className="mt-auto pt-1">
                    {/* The checkout is Feature 5a's; the button copies the code to paste there. */}
                    <Button type="button" variant="outline" className="w-full" onClick={() => void copy(voucher.code)}>
                      {copied === voucher.code ? 'Code copied' : 'Use at checkout'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-muted-foreground">
        A voucher is used once, in full, at checkout. If it is worth more than your total, the excess is forfeited, so use it on a booking
        at least as large as its value.
      </p>
    </RefundsShell>
  )
}
