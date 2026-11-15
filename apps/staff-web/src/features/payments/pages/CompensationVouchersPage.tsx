import { useState } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { errorMessage, usePaymentsApi, type PendingCompensation, type StaffVoucher, type VoucherStatus } from '../api'
import { formatDateTime, formatMoney, voucherStatus } from '../format'
import { useLoad } from '../useLoad'
import { EmptyCard, ErrorAlert, LoadErrorCard, LoadingCard, NoteField, PaymentsPage, ToneBadge } from '../components/common'

/** Compensation & Vouchers: pay a feature 13 decision as a refund or a voucher (cap shown), and cancel vouchers. */
export function CompensationVouchersPage() {
  const api = usePaymentsApi()
  const pending = useLoad(() => api.pendingCompensations(), 'pending')
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <PaymentsPage title="Compensation & vouchers" description="Pay what customer service decided is owed, and manage the vouchers issued.">
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Owed compensation</CardTitle>
          <CardDescription>
            Decisions from customer service cases that are not paid yet. A card refund is capped at what is still refundable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.loading && !pending.data && <p className="text-sm text-muted-foreground">Loading…</p>}
          {pending.error && <ErrorAlert message={pending.error} />}
          {pending.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing is owed right now.</p>}
          {pending.data?.map((decision) => (
            <CompensationRow
              key={decision.id}
              decision={decision}
              onPaid={(text) => {
                setNotice(text)
                pending.reload()
              }}
            />
          ))}
        </CardContent>
      </Card>
      <VoucherList onChanged={setNotice} />
    </PaymentsPage>
  )
}

function CompensationRow({ decision, onPaid }: { decision: PendingCompensation; onPaid: (message: string) => void }) {
  const api = usePaymentsApi()
  const [form, setForm] = useState<'refund' | 'voucher'>(decision.type)
  const [paymentId, setPaymentId] = useState(decision.payments[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const payment = decision.payments.find((p) => p.id === paymentId)
  const currency = payment?.currency ?? 'USD'
  const overCap = form === 'refund' && payment !== undefined && Number(decision.amount) > Number(payment.refundable)
  const noAccount = !decision.complaint_case.customer_id

  async function pay() {
    setBusy(true)
    setError(null)
    try {
      const result = await api.payCompensation({
        case_compensation_id: decision.id,
        form,
        ...(form === 'refund' && { payment_id: paymentId }),
      })
      onPaid(`Case ${decision.complaint_case.case_number} paid as ${result.form} (${result.payout_ref}).`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-medium">
            Case {decision.complaint_case.case_number} · {formatMoney(decision.amount, currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            {decision.reason} · decided {formatDateTime(decision.decided_at)}
          </p>
        </div>
        <ToneBadge tone="info">Decided as {decision.type}</ToneBadge>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`form-${decision.id}`}>Pay as</Label>
          <NativeSelect
            id={`form-${decision.id}`}
            value={form}
            onChange={(e) => setForm(e.target.value as 'refund' | 'voucher')}
            className="w-full"
          >
            <NativeSelectOption value="refund">Refund to card</NativeSelectOption>
            <NativeSelectOption value="voucher" disabled={noAccount}>
              Voucher{noAccount ? ' (needs an account)' : ''}
            </NativeSelectOption>
          </NativeSelect>
        </div>
        {form === 'refund' && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`payment-${decision.id}`}>Payment</Label>
            <NativeSelect id={`payment-${decision.id}`} value={paymentId} onChange={(e) => setPaymentId(e.target.value)} className="w-full">
              {decision.payments.length === 0 && <NativeSelectOption value="">No captured payment</NativeSelectOption>}
              {decision.payments.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.booking?.booking_reference ?? p.purchase_ref} — cap {formatMoney(p.refundable, p.currency)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>
      {overCap && <ErrorAlert message="More than is refundable on this payment. Pay it as a voucher instead." />}
      {error && <ErrorAlert message={error} />}
      <Button disabled={busy || overCap || (form === 'refund' && !paymentId)} onClick={() => void pay()}>
        {busy ? 'Paying…' : 'Pay compensation'}
      </Button>
    </div>
  )
}

function VoucherList({ onChanged }: { onChanged: (message: string) => void }) {
  const api = usePaymentsApi()
  const [status, setStatus] = useState<VoucherStatus | ''>('')
  const [code, setCode] = useState('')
  const [query, setQuery] = useState('')
  const vouchers = useLoad(() => api.listVouchers(status || undefined, query), `${status}:${query}`)
  const [cancelling, setCancelling] = useState<StaffVoucher | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vouchers</CardTitle>
        <CardDescription>Single-use credit, redeemed whole. Cancelling is logged in the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(code)
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="voucher-status">Status</Label>
            <NativeSelect id="voucher-status" value={status} onChange={(e) => setStatus(e.target.value as VoucherStatus | '')}>
              <NativeSelectOption value="">All</NativeSelectOption>
              <NativeSelectOption value="active">Active</NativeSelectOption>
              <NativeSelectOption value="redeemed">Redeemed</NativeSelectOption>
              <NativeSelectOption value="expired">Expired</NativeSelectOption>
              <NativeSelectOption value="cancelled">Cancelled</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="voucher-code">Code</Label>
            <Input id="voucher-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
        {vouchers.loading && !vouchers.data && <LoadingCard />}
        {vouchers.error && <LoadErrorCard message={vouchers.error} onRetry={vouchers.reload} />}
        {vouchers.data?.length === 0 && <EmptyCard>No vouchers match.</EmptyCard>}
        {vouchers.data && vouchers.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vouchers.data.map((v) => {
                const s = voucherStatus(v.status)
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono">{v.code}</TableCell>
                    <TableCell>
                      {v.customer.passenger.first_name} {v.customer.passenger.last_name}
                    </TableCell>
                    <TableCell>{v.case_compensation_id ? 'Compensation' : 'Refund share'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(v.amount, v.currency)}</TableCell>
                    <TableCell>{formatDateTime(v.expires_at)}</TableCell>
                    <TableCell>
                      <ToneBadge tone={s.tone}>{s.label}</ToneBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      {v.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => setCancelling(v)}>
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        {cancelling && (
          <CancelVoucher
            voucher={cancelling}
            onClose={() => setCancelling(null)}
            onDone={() => {
              onChanged(`Voucher ${cancelling.code} cancelled.`)
              setCancelling(null)
              vouchers.reload()
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

function CancelVoucher({ voucher, onClose, onDone }: { voucher: StaffVoucher; onClose: () => void; onDone: () => void }) {
  const api = usePaymentsApi()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (reason.trim().length < 3) return setError('A reason is required.')
    setBusy(true)
    setError(null)
    try {
      await api.cancelVoucher(voucher.id, reason.trim())
      onDone()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="font-medium">Cancel voucher {voucher.code}</p>
      <Label htmlFor="cancel-reason">Reason</Label>
      <NoteField id="cancel-reason" value={reason} onChange={setReason} />
      {error && <ErrorAlert message={error} />}
      <div className="flex gap-2">
        <Button variant="destructive" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Cancelling…' : 'Cancel voucher'}
        </Button>
        <Button variant="outline" onClick={onClose}>
          Keep it
        </Button>
      </div>
    </div>
  )
}
