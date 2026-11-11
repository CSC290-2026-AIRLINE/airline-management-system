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
function ResultButton({ action, className }: { action: PaymentResultAction; className?: string }) {
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
      variant={action.variant === 'outline' ? 'outline' : 'default'}
      disabled={disabled}
      title={action.hint}
      onClick={go}
      className={className}
    >
      {action.label}
    </Button>
  )
}

/** The pill above a card's heading. */
function Pill({ className, children }: { className: string; children: string }) {
  return <span className={cn('inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>{children}</span>
}

/** The bar the confirming page shows: it is the frame's way of saying the page is working on it. */
function ConfirmingBar() {
  return (
    <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Confirming your booking">
      <div className="h-full w-3/5 rounded-full bg-navy" />
    </div>
  )
}

/**
 * One payment result: the frames' payment result page.
 *
 * The state of the payment in a pill, what it means in a heading, what happened in a paragraph and the reference of the
 * payment behind it. The miles page carries more — the trip, the passenger and the receipt are cards under the heading
 * card. A phone gets its own layout for a paid booking: the trip and the charge in the card, the receipt button under it.
 */
export function PaymentResultCard({ result }: { result: PaymentResultDto }) {
  const mobile = result.mobile
  const wide = result.blocks.length > 0

  return (
    <div className="flex flex-col gap-6">
      {/* The result ------------------------------------------------------ */}
      <div
        className={cn(
          'flex flex-col items-start rounded-2xl border border-line bg-card p-5 text-left max-phone:p-4',
          wide ? 'w-full' : 'w-full max-w-162',
          mobile && 'max-phone:hidden',
        )}
      >
        <Pill className={result.badge_class}>{result.badge}</Pill>

        <h2 className="m-0 mt-3 font-sans text-xl font-bold tracking-tight text-foreground">{result.title}</h2>

        {result.body && <p className="m-0 mt-2 text-sm text-muted-foreground">{result.body}</p>}

        {result.progress && <ConfirmingBar />}

        {result.reference && <p className="m-0 mt-3 text-sm text-muted-foreground">{result.reference}</p>}

        {result.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {result.actions.map((action) => (
              <ResultButton key={action.label} action={action} />
            ))}
          </div>
        )}
      </div>

      {/* The phone's own layout of a paid booking -------------------------- */}
      {mobile && (
        <div className="hidden flex-col gap-4 max-phone:flex">
          <div className="rounded-2xl border border-line bg-card p-5">
            <Pill className={result.badge_class}>{result.badge}</Pill>
            <h2 className="m-0 mt-3 font-sans text-2xl font-bold tracking-tight text-foreground">{result.title}</h2>
            <div className="mt-3 flex flex-col gap-1 text-base text-muted-foreground">
              {mobile.summary.map((line) => (
                <p key={line} className="m-0">
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-base text-foreground">
              <span>{mobile.charged}</span>
              <span className="font-semibold tabular-nums">{mobile.amount}</span>
            </div>
          </div>
          {result.actions[0] && <ResultButton action={result.actions[0]} className="h-12 w-full" />}
          <p className="m-0 text-base text-muted-foreground">{mobile.note}</p>
        </div>
      )}

      {/* The cards ------------------------------------------------------- */}
      {wide && (
        <div className="grid grid-cols-[2fr_1fr] gap-4 max-tablet:grid-cols-1">
          {result.blocks.map((block, index) => (
            <div
              key={block.title}
              className={cn(
                'flex flex-col items-start gap-1 rounded-2xl border border-line bg-card p-5',
                /* The receipt, the last card, stands on the right and is as tall as the two on the left. */
                index === 2 && 'col-start-2 row-span-2 row-start-1 max-tablet:col-start-1 max-tablet:row-span-1 max-tablet:row-start-auto',
              )}
            >
              <Pill className="bg-success-soft text-success-strong">{block.badge}</Pill>
              <h3 className="m-0 mt-2 font-sans text-xl font-bold text-foreground">{block.title}</h3>
              {block.body && <p className="m-0 text-sm text-muted-foreground">{block.body}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {block.actions.map((action) => (
                  <ResultButton key={action.label} action={action} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
