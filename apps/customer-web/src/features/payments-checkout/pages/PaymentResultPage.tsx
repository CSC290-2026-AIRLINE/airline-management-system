import { useNavigate } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Card, CardHeader } from '@customer-web/components/ui/card'
import { Skeleton } from '@customer-web/components/ui/skeleton'
import { CustomerShell } from '../components/CustomerShell'
import { FilterChips } from '../components/FilterChips'
import { PaymentResultCard } from '../components/PaymentResultCard'
import { usePaymentResults } from '../hooks/usePaymentResults'
import { usePaymentStatus } from '../hooks/usePaymentStatus'
import { toPaymentResult } from '../live-payment-result'
import { PAYMENT_RESULT_LABELS, type PaymentOutcome, type PaymentResultState } from '../payment-result'

interface PaymentResultPageProps {
  /** Which prototype state to show. The route reads it from `?state=`, so every frame has an address of its own. */
  initialState?: PaymentResultState
  /** The payment Stripe sent the customer back for (`?payment=`). With it the page shows that payment, for real. */
  paymentId?: string
  /** How the customer left Stripe's page (`?outcome=`). */
  outcome?: PaymentOutcome
}

function LoadingCard() {
  return (
    <Card className="w-full max-w-2xl" aria-busy="true">
      <CardHeader>
        <span className="sr-only">Loading the payment result…</span>
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-7 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </CardHeader>
    </Card>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>We could not load your payment</AlertTitle>
      <AlertDescription className="break-words">{message}</AlertDescription>
    </Alert>
  )
}

/**
 * Where Stripe sends the customer back to after the checkout.
 *
 * With `?payment=` it shows that payment: the page asks the backend what the payment is doing and says so — still
 * confirming, paid, a capture that is still running, a declined card, a hold that ran out, or a payment that was not
 * finished. Without it, it is the prototype: the frames' states with sample data, each with an address of its own.
 */
export function PaymentResultPage({ initialState, paymentId, outcome }: PaymentResultPageProps) {
  return (
    <CustomerShell title="Payment result">
      <div className="flex flex-col gap-6">
        {paymentId ? (
          <LiveResult key={paymentId} paymentId={paymentId} outcome={outcome} />
        ) : (
          <PrototypeResult initialState={initialState} />
        )}
      </div>
    </CustomerShell>
  )
}

/** One real payment. */
function LiveResult({ paymentId, outcome }: { paymentId: string; outcome?: PaymentOutcome }) {
  const { loading, error, payment, gaveUp } = usePaymentStatus(paymentId, outcome)

  if (loading) return <LoadingCard />
  if (error || !payment) return <ErrorCard message={error ?? 'The payment could not be read.'} />

  return (
    <>
      <PaymentResultCard result={toPaymentResult(payment, outcome)} />
      {gaveUp && (
        <p className="text-sm text-muted-foreground" role="status">
          This is taking longer than usual. You do not need to pay again; we will email you when it is done. You can reload this page to
          check.
        </p>
      )}
    </>
  )
}

/** The frames' states with sample data, for the pages and screenshots that are not about a real payment. */
function PrototypeResult({ initialState }: { initialState?: PaymentResultState }) {
  const navigate = useNavigate()
  const { loading, error, results } = usePaymentResults()
  /* The URL is the state: the chip writes it, and the browser's back button walks it. */
  const state = initialState ?? 'paid'
  const result = results.find((item) => item.state === state) ?? null

  return (
    <>
      {loading && <LoadingCard />}

      {!loading && error && <ErrorCard message={error} />}

      {!loading && !error && result && (
        <>
          {/* The note the frame puts under the heading ------------------------ */}
          {result.annotation && <p className="text-sm text-muted-foreground">{result.annotation}</p>}

          <PaymentResultCard result={result} />

          {/* The note the frame puts at the foot of the page ------------------- */}
          {result.note && <p className="text-sm text-muted-foreground">{result.note}</p>}
        </>
      )}

      {/* The states of this prototype ------------------------------------- */}
      {!loading && !error && results.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-sm font-medium text-muted-foreground">Prototype — payment state</p>
          <FilterChips
            ariaLabel="Show a payment state"
            value={state}
            onChange={(next) => void navigate({ to: '/payments/result', search: { state: next }, replace: true })}
            options={results.map((item) => ({ value: item.state, label: PAYMENT_RESULT_LABELS[item.state] }))}
          />
        </div>
      )}
    </>
  )
}
