import { useNavigate } from '@tanstack/react-router'
import { Button } from '@customer-web/components/ui/button'
import { cn } from '@customer-web/lib/utils'
import type { PaymentResultAction, PaymentResultDto } from '../payment-result'

/**
 * A button on the result.
 *
 * A button that has nowhere to go yet is drawn, but not live: the frame shows it, and the tooltip says which feature is
 * coming. "Print receipt" is the one that works without a server — the receipt is the customer's own document.
 */
function ResultButton({ action, quiet }: { action: PaymentResultAction; quiet?: boolean }) {
  const navigate = useNavigate()
  const link = action.link
  const disabled = !link && !action.print

  function go() {
    if (action.print) {
      window.print()
      return
    }
    if (!link) return
    if (link.to === '/receipts/$receiptId') {
      navigate({ to: link.to, params: { receiptId: link.receiptId } })
    } else {
      navigate({ to: link.to })
    }
  }

  return (
    <Button
      type="button"
      variant={quiet ? 'link' : action.variant === 'outline' ? 'outline' : 'default'}
      disabled={disabled}
      title={action.hint}
      onClick={go}
      className={quiet ? 'px-0' : undefined}
    >
      {action.label}
    </Button>
  )
}

/**
 * One payment result: the frames' payment result page.
 *
 * The state of the payment in a pill, what it means in a heading, what happened in a paragraph and the reference of the
 * payment behind it. Some states carry more — the miles one shows the trip, the receipt and the passenger — and those
 * are the blocks under the card.
 */
export function PaymentResultCard({ result }: { result: PaymentResultDto }) {
  return (
    <div className="flex flex-col gap-6">
      {/* The result ------------------------------------------------------ */}
      <div className="rounded-3xl border border-line bg-card px-8 py-10 text-center max-phone:px-4 max-phone:py-6">
        <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', result.badge_class)}>
          {result.badge}
        </span>

        <h2 className="m-0 mt-4 font-sans text-3xl font-bold tracking-tight text-foreground max-phone:text-2xl">{result.title}</h2>

        {result.body && <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">{result.body}</p>}

        {result.reference && <p className="mt-4 text-sm text-muted-foreground">{result.reference}</p>}

        {/* The phone frame puts the card and the amount under the heading. */}
        {result.mobile && (
          <div className="mt-4 hidden flex-col items-center gap-1 max-phone:flex">
            <p className="m-0 text-sm text-muted-foreground">{result.mobile.line}</p>
            <p className="m-0 text-xl font-bold text-foreground tabular-nums">{result.mobile.amount}</p>
          </div>
        )}

        {result.actions.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {result.actions.map((action) => (
              <ResultButton key={action.label} action={action} />
            ))}
          </div>
        )}

        {/* The phone frame ends with a reassurance. */}
        {result.mobile && <p className="m-0 mt-6 hidden text-sm text-muted-foreground max-phone:block">{result.mobile.note}</p>}
      </div>

      {/* The blocks ------------------------------------------------------ */}
      {result.blocks.length > 0 && (
        <div className="grid grid-cols-3 gap-4 max-tablet:grid-cols-1">
          {result.blocks.map((block) => (
            <div key={block.title} className="flex flex-col gap-1 rounded-2xl border border-line bg-card p-6">
              <h3 className="m-0 font-sans text-lg font-semibold text-foreground">{block.title}</h3>
              <p className="m-0 text-sm text-muted-foreground">{block.subtitle}</p>
              {block.body && <p className="m-0 mt-2 text-sm text-foreground">{block.body}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-4 pt-3">
                <ResultButton action={block.action} quiet />
                {block.secondary_action && <ResultButton action={block.secondary_action} quiet />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
