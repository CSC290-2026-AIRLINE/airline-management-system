import type { PriceChangedDialogProps } from './contracts'
import { Button } from '@customer-web/components/ui/button'
import { Dialog } from './Dialog'
import { formatMoney } from '../lib/format'

export function PriceChangedDialog({ open, previousTotal, newTotal, currency, onContinue, onCancel }: PriceChangedDialogProps) {
  return (
    <Dialog
      open={open}
      title="The price has changed"
      description="Fares were updated since you searched. Nothing is held yet."
      onClose={onCancel}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onCancel}>
            Back to search
          </Button>
          <Button type="button" onClick={onContinue}>
            Continue at {formatMoney(newTotal, currency)}
          </Button>
        </>
      }
    >
      <dl className="divide-y rounded-lg border bg-muted/40 text-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="text-muted-foreground">Price you saw</dt>
          <dd className="tabular-nums line-through decoration-muted-foreground/60">{formatMoney(previousTotal, currency)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="font-medium">New total</dt>
          <dd className="text-base font-semibold tabular-nums">{formatMoney(newTotal, currency)}</dd>
        </div>
      </dl>
    </Dialog>
  )
}
