import { useState } from 'react'
import { Search } from 'lucide-react'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { FilterChips } from '../components/FilterChips'
import { PaymentLookupTable } from '../components/PaymentLookupTable'
import { PageMessage, PAYMENT_CARD, StaffPageShell } from '../components/StaffPageShell'
import { useStaffPayments } from '../hooks/useStaffPayments'
import { FILTER_LABELS } from '../payment-copy'
import { STAFF_PAYMENT_FILTERS, type StaffPaymentFilter } from '../types'

/** The chips above the lookup, in the frames' order. */
type LookupFilter = StaffPaymentFilter | 'all'

/** How many rows a page holds. */
const PAGE_SIZE = 10

/**
 * The staff payment lookup.
 *
 * The page is read only, the way the frames say it is: a staff member finds a payment and reads what happened to it.
 * The chips are the frames' own — all, captured, failed, capture stalled, voided and refunded — and each one carries the
 * number of rows behind it. "Capture stalled" is a flag rather than a status, and "refunded" is the `reversed` status:
 * the labels are screen words, not database ones.
 */
export function PaymentLookupPage() {
  const { loading, canOpen, role } = useScreenAccess()
  const [filter, setFilter] = useState<LookupFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const list = useStaffPayments(filter === 'all' ? undefined : filter, undefined, search, page)

  if (loading) {
    return (
      <StaffPageShell title="Payment lookup">
        <p className="text-sm text-muted-foreground">Checking your access…</p>
      </StaffPageShell>
    )
  }

  if (!canOpen('f5.payment_lookup')) {
    return (
      <StaffPageShell title="Payment lookup">
        {/* `recorded={false}`: the page is refused before any API call, so no `access_denied` row exists for this
            attempt. The backend guard records the ones that reach it. */}
        <NoAccessScreen screenName="Payment lookup" roleName={role?.name} recorded={false} homeTo="/dashboard" />
      </StaffPageShell>
    )
  }

  const total = list.total
  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const lastOnPage = Math.min(page * PAGE_SIZE, total)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <StaffPageShell
      title="Payment lookup"
      subtitle="Every payment Flython has started, with the state it reached and what went wrong when something did."
    >
      <Card className={PAYMENT_CARD}>
        <CardHeader>
          <CardTitle className="text-lg">Payment lookup</CardTitle>
          <CardDescription>Newest first. Select a payment to see the whole record.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* The search box --------------------------------------------- */}
          <div className="mb-4 flex flex-col gap-1.5 max-tablet:mb-3">
            <Label htmlFor="payment-search" className="text-xs text-muted-foreground">
              Search
            </Label>
            <div className="relative max-w-xl">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="payment-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Filter by PNR, payment id or customer email (leave empty to see all)"
                className="pl-9"
              />
            </div>
          </div>

          {/* The filter chips --------------------------------------------- */}
          <div className="mb-4">
            <FilterChips
              ariaLabel="Filter payments by status"
              value={filter}
              onChange={(value) => {
                setFilter(value)
                setPage(1)
              }}
              options={[
                { value: 'all' as const, label: 'All', count: list.counts.all },
                ...STAFF_PAYMENT_FILTERS.map((item) => ({ value: item, label: FILTER_LABELS[item], count: list.counts[item] })),
              ]}
            />
          </div>

          {/* The list ----------------------------------------------------- */}
          {list.error && <PageMessage tone="danger" title="The payment list could not be loaded" body={list.error} className="mt-2" />}

          {!list.error && list.loading && (
            <p className="py-8 text-center text-sm text-muted-foreground" role="status">
              Loading payments…
            </p>
          )}

          {!list.error && !list.loading && list.payments.length === 0 && (
            <PageMessage title="No payments match" body="Clear the search box to see all payments." />
          )}

          {!list.error && !list.loading && list.payments.length > 0 && (
            <>
              <PaymentLookupTable payments={list.payments} />

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="m-0 text-sm text-muted-foreground" aria-live="polite">
                  {total === 0 ? 'No payments' : `Showing ${firstOnPage}–${lastOnPage} of ${total}`}
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((n) => Math.min(pageCount, n + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* The note the frames put under the list ------------------------ */}
          <p className="mt-4 mb-0 text-xs text-muted-foreground">
            Read only. State changes come only from verified Stripe events and booking confirmation. Staff cannot edit a state by hand.
            Opening a payment is recorded in the audit trail.
          </p>
        </CardContent>
      </Card>
    </StaffPageShell>
  )
}
