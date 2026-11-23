// Adjust stock dialog. Reason (spoilage, damage, expired, count_correction),
// quantity to remove, optional note, and a live "on hand after" preview.
// On save, calls createStockMovement and tells the parent to refresh.
/* eslint-disable react-hooks/set-state-in-effect -- reset validation error as the form changes */

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { StockApiError, useOnboardApi } from '../api'
import type { AdjustStockInput, StockMovementReason, WarehouseStockRow } from '../api/types'

const REASONS: { value: NonNullable<StockMovementReason>; label: string }[] = [
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'damage', label: 'Damage' },
  { value: 'expired', label: 'Expired' },
  { value: 'count_correction', label: 'Count correction' },
]

interface Props {
  row: WarehouseStockRow
  onClose: () => void
  onSaved: (message: string) => void
  onError: (message: string) => void
}

export function AdjustStockDialog({ row, onClose, onSaved, onError }: Props) {
  const api = useOnboardApi()

  const [reason, setReason] = useState<NonNullable<StockMovementReason> | ''>('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const parsedQuantity = useMemo(() => {
    if (quantity.trim() === '') return null
    const n = Number(quantity)
    return Number.isFinite(n) ? n : Number.NaN
  }, [quantity])

  const available = Math.max(0, row.availableQuantity)

  const onHandAfter = useMemo(() => {
    if (parsedQuantity == null || Number.isNaN(parsedQuantity)) return null
    if (parsedQuantity < 0) return null
    return row.quantityOnHand - parsedQuantity
  }, [parsedQuantity, row.quantityOnHand])

  const quantityInvalid = parsedQuantity != null && (Number.isNaN(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > available)

  // Reset any prior error when the inputs change.
  useEffect(() => {
    setError(null)
  }, [reason, quantity, note])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const nextErrors: string[] = []
    if (!reason) nextErrors.push('Pick a reason for this adjustment.')
    if (parsedQuantity == null || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      nextErrors.push('Quantity must be greater than zero.')
    } else if (parsedQuantity > available) {
      nextErrors.push(`Only ${available} units are available (${row.quantityReserved} are reserved).`)
    }
    if (nextErrors.length > 0) {
      setError(nextErrors[0])
      return
    }

    setSubmitting(true)
    try {
      const input: AdjustStockInput = {
        warehouseId: row.warehouseId,
        productId: row.productId,
        quantity: parsedQuantity as number,
        reason: reason as NonNullable<StockMovementReason>,
        note: note.trim() === '' ? null : note.trim(),
      }
      await api.stock.createStockMovement(input)
      onSaved(`Removed ${input.quantity} of ${row.productName}.`)
    } catch (err) {
      if (err instanceof StockApiError) {
        setError(err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not adjust the stock.'
        setError(message)
        onError(message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {row.productName} · {row.sku || row.warehouseId}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-sm text-muted-foreground">Currently on hand</span>
          <span className="text-xl font-semibold tabular-nums">{row.quantityOnHand}</span>
        </div>

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-reason">Reason</Label>
            <NativeSelect
              id="adj-reason"
              className="w-full"
              value={reason}
              onChange={(e) => setReason(e.target.value as NonNullable<StockMovementReason> | '')}
            >
              <NativeSelectOption value="">Select a reason</NativeSelectOption>
              {REASONS.map((r) => (
                <NativeSelectOption key={r.value} value={r.value}>
                  {r.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-qty">Quantity to remove</Label>
            <Input
              id="adj-qty"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoComplete="off"
              aria-invalid={parsedQuantity != null && parsedQuantity > available ? true : undefined}
            />
            {parsedQuantity != null && parsedQuantity > available && (
              <p className="m-0 text-sm text-destructive" role="alert">
                Only {available} units are available ({row.quantityReserved} are reserved).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="adj-note">Note (optional)</Label>
            <Input
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. cold room failure"
              autoComplete="off"
            />
          </div>

          {onHandAfter != null && (
            <p className={`m-0 text-sm ${quantityInvalid ? 'text-destructive' : 'text-muted-foreground'}`}>
              On hand after adjustment: <span className="font-semibold tabular-nums">{onHandAfter}</span>
            </p>
          )}

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !reason || parsedQuantity == null || quantityInvalid}>
              {submitting ? 'Saving…' : 'Confirm adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
