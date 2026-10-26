// Confirmation modal for cancelling a product order. Rendered as a
// portal-style overlay from `ExtraServicesSection` when a cancel target is
// set. Keyboard-dismissible: Escape closes. The destructive action
// receives focus on mount so the user can confirm with Enter.

import { useEffect, useRef } from 'react'
import { Button } from '../../components/ui/button'
import type { ProductOrder } from './types'
import { formatMoney } from './format'

interface Props {
  order: ProductOrder | null
  isPending: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function CancelOrderDialog({ order, isPending, error, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!order) return
    confirmRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [order, onCancel])

  if (!order) return null

  return (
    <div
      className="fixed inset-0 bg-[rgba(16,24,40,0.55)] flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-xl max-w-[440px] w-full shadow-[0_12px_32px_rgba(16,24,40,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="f12-cancel-title"
      >
        <header className="px-6 pt-6 pb-2">
          <h2 id="f12-cancel-title" className="font-sans font-medium text-foreground text-lg m-0 mb-2">
            Cancel order {order.id}?
          </h2>
          <p className="font-sans font-normal text-muted-foreground text-sm leading-[1.4] m-0">
            {order.flightNumber} · {order.flightOriginCode} to {order.flightDestinationCode}
          </p>
        </header>
        <div className="px-6 py-2 pb-4">
          <div className="flex items-center justify-between bg-[#eef2f7] rounded-lg px-3 py-2.5 mb-3.5">
            <span className="font-sans font-semibold text-foreground text-sm">Amount to refund</span>
            <span className="font-mono font-medium text-foreground text-sm tabular-nums">
              {formatMoney(order.totalAmount, order.currency)}
            </span>
          </div>
          <p className="font-sans font-normal text-foreground text-sm leading-relaxed m-0 mb-2">
            This creates a refund request for {formatMoney(order.totalAmount, order.currency)}. It is not refunded straight away: F5 reviews
            the request and returns the money to your original payment method.
          </p>
          <p className="font-sans font-normal text-muted-foreground text-[13px] leading-relaxed m-0">
            The items are released back to stock and will not be loaded for the flight.
          </p>
          {error && (
            <p
              className="text-destructive bg-[#fff3f2] border border-[#fdb5b0] rounded-lg px-4 py-3 my-4 text-sm leading-[1.45]"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2.5 px-6 py-3.5 bg-[#f8fafc] border-t border-[#e8edf3] rounded-b-xl">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
            className="h-10 gap-1.5 px-[18px] text-sm font-semibold rounded-lg"
          >
            Keep order
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="danger"
            onClick={onConfirm}
            disabled={isPending}
            className="h-10 gap-1.5 px-[18px] text-sm font-semibold rounded-lg"
          >
            {isPending ? 'Cancelling…' : 'Cancel order and request refund'}
          </Button>
        </div>
      </div>
    </div>
  )
}
