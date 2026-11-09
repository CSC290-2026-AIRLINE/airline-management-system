import { useState } from 'react'
import { Button } from '@customer-web/components/ui/button'
import { REFUND_STATE_COPY } from '../receipt-copy'
import type { RefundState } from '../types'

interface RefundRequestButtonProps {
  state: RefundState
}

/**
 * The refund button on a receipt.
 *
 * Feature 5b owns refunds: this renders the button the frame shows and nothing else. Clicking it explains that the
 * request flow is not part of this release rather than opening a half-built dialog.
 *
 * TODO(F5b): replace the note with the request-a-refund dialog.
 */
export function RefundRequestButton({ state }: RefundRequestButtonProps) {
  const [showNote, setShowNote] = useState(false)
  const copy = REFUND_STATE_COPY[state]

  if (!copy.canRequest) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{copy.label}</p>
        <p className="text-sm text-muted-foreground">{copy.note}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" className="w-fit" onClick={() => setShowNote(true)}>
        {copy.label}
      </Button>
      {showNote && (
        <p className="text-sm text-muted-foreground" role="status">
          Refund requests open with Feature 5b — nothing was sent.
        </p>
      )}
    </div>
  )
}
