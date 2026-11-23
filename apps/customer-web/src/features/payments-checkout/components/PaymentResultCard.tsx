import { useNavigate } from '@tanstack/react-router'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Progress } from '@customer-web/components/ui/progress'
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

/**
 * One payment result: the state of the payment in a badge, what it means in a heading, what happened in a paragraph and
 * the reference of the payment behind it. The miles page carries more — the trip, the passenger and the receipt are cards
 * under the heading card. A phone gets its own layout for a paid booking: the trip and the charge in the card, the receipt
 * button under it.
 */
export function PaymentResultCard({ result }: { result: PaymentResultDto }) {
  const mobile = result.mobile
  const wide = result.blocks.length > 0

  return (
    <div className="flex flex-col gap-6">
      <Card className={cn(wide ? 'w-full' : 'w-full max-w-2xl', mobile && 'max-sm:hidden')}>
        <CardHeader>
          <Badge variant={result.badge_variant} className="w-fit">
            {result.badge}
          </Badge>
          <CardTitle className="text-xl">{result.title}</CardTitle>
          {result.body && <CardDescription>{result.body}</CardDescription>}
        </CardHeader>
        {(result.progress || result.reference || result.actions.length > 0) && (
          <CardContent className="flex flex-col gap-4">
            {result.progress && <Progress value={60} aria-label="Confirming your booking" />}
            {result.reference && <p className="text-sm text-muted-foreground">{result.reference}</p>}
            {result.actions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {result.actions.map((action) => (
                  <ResultButton key={action.label} action={action} />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {mobile && (
        <div className="hidden flex-col gap-4 max-sm:flex">
          <Card>
            <CardHeader>
              <Badge variant={result.badge_variant} className="w-fit">
                {result.badge}
              </Badge>
              <CardTitle className="text-xl">{result.title}</CardTitle>
              <CardDescription className="flex flex-col gap-1">
                {mobile.summary.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3 border-t pt-6">
              <span>{mobile.charged}</span>
              <span className="font-semibold tabular-nums">{mobile.amount}</span>
            </CardContent>
          </Card>
          {result.actions[0] && <ResultButton action={result.actions[0]} className="w-full" />}
          <p className="text-sm text-muted-foreground">{mobile.note}</p>
        </div>
      )}

      {wide && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
          {result.blocks.map((block, index) => (
            <Card
              key={block.title}
              // The receipt, the last card, stands on the right and is as tall as the two on the left.
              className={cn(index === 2 && 'md:col-start-2 md:row-span-2 md:row-start-1')}
            >
              <CardHeader>
                <Badge variant="success" className="w-fit">
                  {block.badge}
                </Badge>
                <CardTitle className="text-xl">{block.title}</CardTitle>
                {block.body && <CardDescription>{block.body}</CardDescription>}
              </CardHeader>
              {block.actions.length > 0 && (
                <CardContent className="flex flex-wrap items-center gap-2">
                  {block.actions.map((action) => (
                    <ResultButton key={action.label} action={action} />
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
