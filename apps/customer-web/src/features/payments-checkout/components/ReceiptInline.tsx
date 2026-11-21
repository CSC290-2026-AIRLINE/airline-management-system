import { useReceipt } from '../hooks/useReceipt'
import { formatAmount, STATUS_BADGE_CLASSES, STATUS_LABELS } from '../receipt-copy'
import { cn } from '@customer-web/lib/utils'

/**
 * A receipt opened under its card, on a phone.
 *
 * The phone frame does not open a panel: the card stays in the list and the receipt unfolds under it — the payment's
 * state, what the money paid for, the total and the credit note. Everything else (the buttons, the notes) is on the
 * receipt's own panel and page.
 */
export function ReceiptInline({ receiptId }: { receiptId: string }) {
  const { loading, error, receipt } = useReceipt(receiptId)

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-line bg-card" aria-busy="true" />
  }
  if (error || !receipt) {
    return (
      <p className="m-0 rounded-2xl border border-line bg-card p-4 text-sm text-muted-foreground" role="alert">
        {error ?? 'We could not load this receipt.'}
      </p>
    )
  }

  /* The phone frame names a paid payment by its payment state, "Captured", not by the receipt's "Paid". */
  const state = receipt.status === 'captured' ? 'Captured' : STATUS_LABELS[receipt.status]

  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-4">
      <span className={cn('inline-flex rounded-full px-3 py-1 text-sm font-medium', STATUS_BADGE_CLASSES[receipt.status])}>{state}</span>
      <ul className="m-0 mt-3 list-none p-0">
        {receipt.lines.map((line, index) => (
          <li key={`${line.line_type}-${index}`} className="flex items-start justify-between gap-4 border-b border-line py-3">
            <span className="text-base text-foreground">{line.description}</span>
            <span className="shrink-0 text-base text-foreground tabular-nums">{formatAmount(line.amount)}</span>
          </li>
        ))}
        <li className="flex items-start justify-between gap-4 py-3 font-bold">
          <span className="text-base text-foreground">Total</span>
          <span className="text-base text-foreground tabular-nums">{formatAmount(receipt.amount)}</span>
        </li>
        {receipt.credit_note && (
          <li className="flex items-start justify-between gap-4 border-t border-line py-3">
            <span className="text-base text-foreground">{receipt.credit_note.document_number} credit note</span>
            <span className="shrink-0 text-base text-foreground tabular-nums">−{formatAmount(receipt.credit_note.amount)}</span>
          </li>
        )}
      </ul>
    </div>
  )
}
