import { useState } from 'react'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { PaymentLookupTable } from '../components/PaymentLookupTable'
import { PageMessage, PAYMENT_CARD, StaffPageShell } from '../components/StaffPageShell'
import { useStaffPayments } from '../hooks/useStaffPayments'
import { FILTER_LABELS } from '../payment-copy'
import { STAFF_PAYMENT_FILTERS, type PaymentSourceFeature, type StaffPaymentFilter } from '../types'

/** Radix `Select` items cannot have an empty value, so "no filter" gets its own sentinel. */
const ALL = '__all__'

const SOURCE_FEATURES: { value: PaymentSourceFeature; label: string }[] = [
  { value: 3, label: 'Flight booking' },
  { value: 6, label: 'Excess baggage' },
  { value: 12, label: 'Onboard sale' },
  { value: 17, label: 'Cargo' },
]

/**
 * The staff payment lookup.
 *
 * The filters are the frames' own: captured, failed, capture stalled, voided and refunded. "Capture stalled" is a flag
 * rather than a status, and "refunded" is the `reversed` status — the labels are screen words, not database ones.
 */
export function PaymentLookupPage() {
  const { loading, canOpen } = useScreenAccess()
  const [status, setStatus] = useState<StaffPaymentFilter | undefined>(undefined)
  const [sourceFeature, setSourceFeature] = useState<PaymentSourceFeature | undefined>(undefined)
  const list = useStaffPayments(status, sourceFeature)

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
        <NoAccessScreen screenName="Payment lookup" homeTo="/dashboard" />
      </StaffPageShell>
    )
  }

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
          {/* Filters ---------------------------------------------------- */}
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <div className="flex min-w-44 flex-col gap-1.5">
              <Label htmlFor="payment-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <Select value={status ?? ALL} onValueChange={(v) => setStatus(v === ALL ? undefined : (v as StaffPaymentFilter))}>
                <SelectTrigger id="payment-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="font-sans">
                  <SelectItem value={ALL}>All payments</SelectItem>
                  {STAFF_PAYMENT_FILTERS.map((filter) => (
                    <SelectItem key={filter} value={filter}>
                      {FILTER_LABELS[filter]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-44 flex-col gap-1.5">
              <Label htmlFor="payment-feature" className="text-xs text-muted-foreground">
                Feature
              </Label>
              <Select
                value={sourceFeature === undefined ? ALL : String(sourceFeature)}
                onValueChange={(v) => setSourceFeature(v === ALL ? undefined : (Number(v) as PaymentSourceFeature))}
              >
                <SelectTrigger id="payment-feature" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="font-sans">
                  <SelectItem value={ALL}>All features</SelectItem>
                  {SOURCE_FEATURES.map((feature) => (
                    <SelectItem key={feature.value} value={String(feature.value)}>
                      {feature.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
              {list.loading ? 'Loading…' : `${list.total} payment${list.total === 1 ? '' : 's'}`}
            </p>
          </div>

          {/* The list ---------------------------------------------------- */}
          {list.error && (
            <PageMessage
              tone="danger"
              title="The payment list could not be loaded"
              body={list.error}
              className="mt-2"
            />
          )}

          {!list.error && list.loading && (
            <p className="py-8 text-center text-sm text-muted-foreground" role="status">
              Loading payments…
            </p>
          )}

          {!list.error && !list.loading && list.payments.length === 0 && (
            <PageMessage title="No payments match" body="Clear a filter to widen the search." />
          )}

          {!list.error && !list.loading && list.payments.length > 0 && <PaymentLookupTable payments={list.payments} />}
        </CardContent>
      </Card>
    </StaffPageShell>
  )
}
