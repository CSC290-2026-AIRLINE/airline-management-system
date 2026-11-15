import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { RotateCcw, Search, Undo2 } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { errorMessage, usePaymentsApi, type PaymentDetail } from '../api'
import { formatDateTime, formatMoney, paymentStatus, purchaseLabel, reasonLabel, refundStatus } from '../format'
import { useLoad } from '../useLoad'
import { EmptyCard, ErrorAlert, LoadErrorCard, LoadingCard, PaymentsPage, ToneBadge } from '../components/common'
import { StaffRefundDialog } from '../components/StaffRefundDialog'

/** Payment Lookup: find by booking reference, Air Waybill, payment id or customer; timeline; retry capture; refund. */
export function PaymentLookupPage({
  query,
  selected,
  onSearch,
  onSelect,
}: {
  query: string
  selected?: string
  onSearch: (q: string) => void
  onSelect: (id: string) => void
}) {
  const api = usePaymentsApi()
  const [input, setInput] = useState(query)
  const results = useLoad(() => (query.trim().length >= 2 ? api.searchPayments(query) : Promise.resolve(null)), query)

  function submit(e: FormEvent) {
    e.preventDefault()
    onSearch(input.trim())
  }

  return (
    <PaymentsPage
      title="Payment lookup"
      description="Find a payment by booking reference, Air Waybill number, payment id or customer email."
    >
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="payment-search">Search</Label>
          <Input
            id="payment-search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ABC123, 217-12345675, payment id, email"
          />
        </div>
        <Button type="submit" disabled={input.trim().length < 2}>
          <Search /> Search
        </Button>
      </form>

      {query && results.loading && <LoadingCard label="Searching…" />}
      {results.error && <LoadErrorCard message={results.error} onRetry={results.reload} />}
      {results.data?.length === 0 && <EmptyCard>No payment matches “{query}”.</EmptyCard>}
      {results.data && results.data.length > 0 && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.data.map((p) => {
                  const status = paymentStatus(p.status)
                  return (
                    <TableRow key={p.id} data-state={p.id === selected ? 'selected' : undefined}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium text-primary underline-offset-4 hover:underline"
                          onClick={() => onSelect(p.id)}
                        >
                          {purchaseLabel(p)}
                        </button>
                        {p.awb_number && <div className="text-xs text-muted-foreground">AWB {p.awb_number}</div>}
                      </TableCell>
                      <TableCell>{p.payer?.name ?? '—'}</TableCell>
                      <TableCell>{formatDateTime(p.started_at)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.amount_total, p.currency)}</TableCell>
                      <TableCell>
                        <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selected && <PaymentDetailCard paymentId={selected} />}
    </PaymentsPage>
  )
}

function PaymentDetailCard({ paymentId }: { paymentId: string }) {
  const api = usePaymentsApi()
  const detail = useLoad(() => api.getPayment(paymentId), paymentId)
  const [refundOpen, setRefundOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  async function retryCapture() {
    setRetrying(true)
    setActionError(null)
    setMessage(null)
    try {
      const result = await api.retryCapture(paymentId)
      if (result.ok) setMessage('Captured.')
      else setActionError(result.error ?? 'Capture failed again')
      detail.reload()
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setRetrying(false)
    }
  }

  if (detail.error) return <LoadErrorCard message={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <LoadingCard />
  const p = detail.data
  const status = paymentStatus(p.status)
  const canRefund =
    (p.status === 'captured' || p.status === 'reversed') && p.lines.some((l) => Number(l.amount) > Number(l.refunded_amount))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {purchaseLabel(p)} <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
          {p.capture_stalled_at && <ToneBadge tone="bad">Capture stalled</ToneBadge>}
        </CardTitle>
        <CardDescription>
          Payment {p.id} · {p.provider} · {p.payer?.name ?? 'no account'}
          {p.receipt && ` · ${p.receipt.document_number}`}
        </CardDescription>
        <CardAction className="flex gap-2">
          {p.status === 'authorised' && (
            <Button variant="outline" disabled={retrying} onClick={() => void retryCapture()}>
              <RotateCcw /> {retrying ? 'Retrying…' : 'Retry capture'}
            </Button>
          )}
          {canRefund && (
            <Button onClick={() => setRefundOpen(true)}>
              <Undo2 /> Refund
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {message && (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {actionError && <ErrorAlert message={actionError} />}
        {p.last_error && <p className="text-sm text-muted-foreground">Last error: {p.last_error}</p>}

        <section>
          <h3 className="mb-2 text-sm font-semibold">Lines</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell>{l.line_type}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(l.amount, p.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(l.refunded_amount, p.currency)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} className="font-semibold">
                  Total
                  {Number(p.voucher_amount) > 0 &&
                    ` (voucher ${p.voucher_code} ${formatMoney(p.voucher_amount, p.currency)}, card ${formatMoney(p.card_amount, p.currency)})`}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatMoney(p.amount_total, p.currency)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </section>

        <Timeline payment={p} />
      </CardContent>
      <StaffRefundDialog
        payment={p}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        onDone={(text) => {
          setMessage(text)
          detail.reload()
        }}
      />
    </Card>
  )
}

/** Payment timeline: state changes, hosted sessions, webhook events and refunds, oldest first. */
function Timeline({ payment: p }: { payment: PaymentDetail }) {
  const items: { at: string; label: string; detail?: string; refundId?: string }[] = [
    { at: p.started_at, label: 'Payment created', detail: `Hold until ${formatDateTime(p.expires_at)}` },
    ...p.attempts.map((a) => ({
      at: a.created_at,
      label: `Hosted session ${a.status}`,
      detail: [a.card_brand && `${a.card_brand} •••• ${a.card_last4}`, a.failure_code && `last decline: ${a.failure_code}`]
        .filter(Boolean)
        .join(' · '),
    })),
    ...p.events.map((e) => ({ at: e.received_at, label: e.event_type, detail: e.processed_at ? 'applied' : 'stored, not applied yet' })),
    ...(p.authorised_at ? [{ at: p.authorised_at, label: 'Authorised' }] : []),
    ...(p.captured_at ? [{ at: p.captured_at, label: 'Captured' }] : []),
    ...(p.voided_at ? [{ at: p.voided_at, label: 'Voided', detail: p.last_error ?? undefined }] : []),
    ...(p.capture_stalled_at ? [{ at: p.capture_stalled_at, label: 'Capture stalled', detail: `${p.capture_attempts} attempts` }] : []),
    ...p.refunds.map((r) => ({
      at: r.requested_at,
      label: `Refund ${formatMoney(r.amount, p.currency)} · ${refundStatus(r.status).label}`,
      detail: reasonLabel(r.reason),
      refundId: r.id,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
      <ol className="space-y-2 border-l pl-4">
        {items.map((item, i) => (
          <li key={i} className="text-sm">
            <span className="text-muted-foreground">{formatDateTime(item.at)}</span> · <span className="font-medium">{item.label}</span>
            {item.detail && <span className="text-muted-foreground"> — {item.detail}</span>}
            {item.refundId && (
              <>
                {' '}
                <Link
                  to="/payments/refunds/$refundId"
                  params={{ refundId: item.refundId }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  open
                </Link>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
