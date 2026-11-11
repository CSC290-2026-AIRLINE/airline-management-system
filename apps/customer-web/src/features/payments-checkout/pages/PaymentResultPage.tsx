import { useNavigate } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import { CustomerShell } from '../components/CustomerShell'
import { FilterChips } from '../components/FilterChips'
import { PaymentResultCard } from '../components/PaymentResultCard'
import { usePaymentResults } from '../hooks/usePaymentResults'
import { PAYMENT_RESULT_LABELS, type PaymentResultState } from '../payment-result'

interface PaymentResultPageProps {
  /** Which state to show. The route reads it from `?state=`, so every frame has an address of its own. */
  initialState?: PaymentResultState
}

/**
 * Where Stripe sends the customer back to after the checkout.
 *
 * The page says what the payment is doing: still confirming, paid, paid with miles, a paid cargo booking, a capture
 * that is still running, a declined card or a hold that ran out. Each of those is a different screen in the frames, so
 * the states can be switched at the foot of the page — and each one has its own URL, so a state can be linked to.
 */
export function PaymentResultPage({ initialState }: PaymentResultPageProps) {
  const navigate = useNavigate()
  const { loading, error, results } = usePaymentResults()
  /* The URL is the state: the chip writes it, and the browser's back button walks it. */
  const state = initialState ?? 'paid'
  const result = results.find((item) => item.state === state) ?? null

  return (
    <CustomerShell title="Payment result">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {loading && (
          <div className="rounded-3xl border border-line bg-card p-10" aria-busy="true">
            <span className="sr-only">Loading the payment result…</span>
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-8 w-72" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
          </div>
        )}

        {!loading && error && (
          <Card className="border-danger-line/40 bg-danger-soft" role="alert">
            <CardContent className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
              <div>
                <h2 className="m-0 font-sans text-base font-semibold text-foreground">We could not load your payment</h2>
                <p className="mt-1 text-sm text-muted-foreground break-words">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !error && result && (
          <>
            {/* The note the frame puts under the heading ------------------------ */}
            {result.annotation && <p className="m-0 text-sm text-muted-foreground">{result.annotation}</p>}

            <PaymentResultCard result={result} />

            {/* The note the frame puts at the foot of the page ------------------- */}
            {result.note && <p className="m-0 text-sm text-muted-foreground">{result.note}</p>}
          </>
        )}

        {/* The states of this prototype ------------------------------------- */}
        {!loading && !error && results.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="m-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Prototype — payment state</p>
            <FilterChips
              ariaLabel="Show a payment state"
              value={state}
              onChange={(next) => void navigate({ to: '/payments/result', search: { state: next }, replace: true })}
              options={results.map((item) => ({ value: item.state, label: PAYMENT_RESULT_LABELS[item.state] }))}
            />
          </div>
        )}
      </div>
    </CustomerShell>
  )
}
