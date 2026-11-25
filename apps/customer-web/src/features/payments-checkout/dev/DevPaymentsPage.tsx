import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { CustomerShell } from '../components/CustomerShell'
import { formatAmount } from '../receipt-copy'

/*
 * TODO(F5-dev): DELETE THIS FOLDER (`features/payments-checkout/dev`) and `routes/_authenticated/dev.payments.tsx`
 * before the PR merges. It is a development tool, not part of the product.
 */

interface DevPayment {
  id: string
  reference: string
  description: string
  status: string
  provider: string
  amount: number
  currency: string
  started_at: string
  expires_at: string
}

const TOOLS_OFF = 'The dev tools are off. Set PAYMENT_DEV_TOOLS="true" in apps/backend/.env and restart the backend.'

const STATUS_CLASS: Record<string, string> = {
  created: 'bg-warn-tint text-warn',
  authorised: 'bg-warn-tint text-warn',
  captured: 'bg-ok-tint text-ok',
  failed: 'bg-danger-tint text-danger',
  voided: 'bg-secondary text-muted-foreground',
  expired: 'bg-secondary text-muted-foreground',
  reversed: 'bg-secondary text-muted-foreground',
}

function useDevApi() {
  const { fetchWithAuth } = useAppAuth()

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, init)
    const text = await res.text()
    const body = text ? (JSON.parse(text) as { message?: string | string[] }) : null
    if (!res.ok) {
      if (res.status === 404 && path.startsWith('/api/dev/')) throw new Error(TOOLS_OFF)
      const message = Array.isArray(body?.message) ? body.message.join('. ') : body?.message
      throw new Error(message ?? `${res.status} ${res.statusText}`)
    }
    return body as T
  }

  const post = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return {
    list: () => json<DevPayment[]>('/api/dev/payments'),
    create: (amount: number, description: string) =>
      json<DevPayment>('/api/dev/payments', post({ amount, ...(description && { description }) })),
    removeAll: () => json<{ removed: number }>('/api/dev/payments', { method: 'DELETE' }),
    startCheckout: (id: string) => json<{ checkout_url: string }>(`/api/payments/${encodeURIComponent(id)}/checkout`, { method: 'POST' }),
  }
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function DevTools() {
  const api = useDevApi()
  const [payments, setPayments] = useState<DevPayment[] | null>(null)
  const [amount, setAmount] = useState('72')
  const [description, setDescription] = useState('Stripe test payment')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label)
    setError(null)
    try {
      await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  /** The time the list was read, so the page can tell a hold that has ended without reading the clock while it renders. */
  const [readAt, setReadAt] = useState(() => Date.now())
  const show = (rows: DevPayment[]) => {
    setPayments(rows)
    setReadAt(Date.now())
  }
  const refresh = () => run('refresh', async () => show(await api.list()))

  useEffect(() => {
    let current = true
    api
      .list()
      .then((rows) => {
        if (!current) return
        setPayments(rows)
        setReadAt(Date.now())
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      current = false
    }
    // `api` is rebuilt every render, so it stays out of the dependency list; this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Whole or two-decimal amounts only. The field is text, not a number input: a number input changes its value by a step on an
  // arrow key or a mouse wheel (74 became 73.98), which is the wrong thing to happen to the price of a test payment.
  const value = Number(amount)
  const valid = /^\d{1,4}(\.\d{1,2})?$/.test(amount.trim()) && value >= 1 && value <= 5000

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-line bg-card p-5">
        <p className="m-0 text-sm font-semibold text-foreground">Development tool: a stand-in for the selling feature</p>
        <p className="mt-1 mb-0 text-sm text-muted-foreground">
          Start a test payment, pay it on Stripe&apos;s page with the test card <span className="font-medium">4242 4242 4242 4242</span>{' '}
          (any future date, any CVC), and Stripe brings you back to the real result page. Run this so the payment is captured, then open the
          receipt, ask for a refund, and decide it in staff-web:
        </p>
        <code className="mt-2 block rounded-md bg-secondary px-3 py-2 font-mono text-xs break-all text-foreground">
          stripe listen --events
          payment_intent.amount_capturable_updated,payment_intent.payment_failed,checkout.session.expired,refund.updated,refund.failed
          --forward-to localhost:8080/api/webhooks/stripe
        </code>
        <p className="mt-2 mb-0 text-xs text-muted-foreground">TODO(F5-dev): delete this page before the PR merges.</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault()
          void run('create', async () => {
            await api.create(value, description.trim())
            show(await api.list())
          })
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Amount (USD)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={!valid}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-10 w-32 rounded-lg border border-line bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">What it is for</span>
          <input
            type="text"
            maxLength={80}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="h-10 rounded-lg border border-line bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>
        <Button type="submit" disabled={!valid || busy !== null}>
          {busy === 'create' ? 'Creating…' : valid ? `Create test payment of ${value.toFixed(2)} USD` : 'Create test payment'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="m-0 rounded-lg bg-danger-tint px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <section aria-labelledby="dev-payments-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dev-payments-heading" className="m-0 font-sans text-lg font-semibold text-foreground">
            Your test payments
          </h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null || !payments?.length}
              onClick={() =>
                void run('remove', async () => {
                  await api.removeAll()
                  show(await api.list())
                })
              }
            >
              Remove my test payments
            </Button>
          </div>
        </div>

        {payments === null && !error && <p className="m-0 text-sm text-muted-foreground">Loading…</p>}
        {payments?.length === 0 && <p className="m-0 text-sm text-muted-foreground">No test payments yet. Create one above.</p>}

        {payments?.map((payment) => {
          const expired = payment.status === 'created' && new Date(payment.expires_at).getTime() < readAt
          return (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-4">
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-foreground">
                  {payment.reference} · {payment.description}
                </p>
                <p className="m-0 mt-0.5 text-sm text-muted-foreground">
                  {formatAmount(payment.amount)} {payment.currency} · {payment.provider} · hold until {time(payment.expires_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border-0 ${STATUS_CLASS[payment.status] ?? 'bg-secondary text-muted-foreground'}`}>
                  {payment.status === 'reversed' ? 'refunded' : payment.status}
                </Badge>
                {payment.status === 'created' && (
                  <Button
                    type="button"
                    disabled={busy !== null || expired || payment.provider !== 'stripe'}
                    title={
                      payment.provider !== 'stripe'
                        ? 'The fake provider has no payment page. Set PAYMENT_PROVIDER="stripe" in apps/backend/.env.'
                        : expired
                          ? 'The hold on this payment has ended. Create a new one.'
                          : undefined
                    }
                    onClick={() =>
                      void run('pay', async () => {
                        const { checkout_url } = await api.startCheckout(payment.id)
                        window.location.assign(checkout_url)
                      })
                    }
                  >
                    Pay with Stripe
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link to="/payments/result" search={{ payment: payment.id }}>
                    View result
                  </Link>
                </Button>
                {payment.status === 'captured' && (
                  <Button asChild variant="outline">
                    <Link to="/receipts">Receipts</Link>
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

/** `/dev/payments`: a development tool to try Feature 5a end to end. It exists only while running `npm run dev`. */
export function DevPaymentsPage() {
  return (
    <CustomerShell title="Payment test tools">
      {import.meta.env.DEV ? (
        <DevTools />
      ) : (
        <p className="m-0 text-sm text-muted-foreground">The payment test tools are only available when the app runs in development.</p>
      )}
    </CustomerShell>
  )
}
