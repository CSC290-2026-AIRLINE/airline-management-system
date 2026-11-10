import { useState, type FormEvent } from 'react'
import { CABINS, errorMessage, usePricingApi, type Cabin } from '../api'
import { cabinLabel, formatMoney } from '../format'
import { useConfirm } from '../hooks/useConfirm'
import { useLoad } from '../hooks/useLoad'
import { SEAT_TYPES, useAddOnChargesApi, type SeatFee, type SeatType } from './api'
import { seatTypeLabel } from './labels'
import { Button } from '@staff-web/components/ui/button'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Label } from '@staff-web/components/ui/label'
import { Input } from '@staff-web/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { CARD_BODY, CARD_TITLE, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_WRAP } from '../components/card-styles'

const AMOUNT = /^\d+(\.\d{1,2})?$/ // CreateSeatFeeDto: 0 or more, up to 2 decimals
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)

// Cabins down the side, seat types across the top. An empty cell means no fee is set for that pair.
export function SeatFeesTab() {
  const api = useAddOnChargesApi()
  const pricingApi = usePricingApi()
  const seatFees = useLoad(() => api.listSeatFees(), 'seat-fees')
  const currency = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const loadError = seatFees.error ?? currency.error

  return (
    <Card aria-labelledby="sf-title">
      <CardHeader>
        <CardTitle id="sf-title" role="heading" aria-level={2} className={CARD_TITLE}>
          Seat fees
        </CardTitle>
        <CardDescription>Extra charge for a seat type in a cabin, the same on every flight. Click a cell to set it.</CardDescription>
      </CardHeader>
      <CardContent className={CARD_BODY}>
        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription className="block">
              Could not load seat fees: {loadError}{' '}
              <Button
                variant="link"
                className="h-auto p-0"
                type="button"

                onClick={() => {
                  seatFees.reload()
                  currency.reload()
                }}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : !seatFees.data || !currency.data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading seat fees…</p>
        ) : (
          <div className={TABLE_WRAP}>
            <Table className="text-[13px] text-(--pr-primary)">
              <TableHeader className="[&_tr]:border-0">
                <TableRow className={TABLE_HEAD_ROW}>
                  <TableHead scope="col" className={`${TABLE_HEAD} pl-4`}>
                    Cabin
                  </TableHead>
                  {SEAT_TYPES.map((seatType) => (
                    <TableHead key={seatType} scope="col" className={TABLE_HEAD}>
                      {seatTypeLabel(seatType)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {CABINS.map((cabin) => (
                  <TableRow key={cabin}>
                    <TableHead scope="row" className="font-bold">
                      {cabinLabel(cabin)}
                    </TableHead>
                    {SEAT_TYPES.map((seatType) => {
                      const seatFee = seatFees.data?.find((fee) => fee.cabin === cabin && fee.seat_type === seatType)
                      return (
                        <TableCell key={`${seatType}:${seatFee?.id ?? 'none'}:${seatFee?.amount ?? ''}`}>
                          <SeatFeeCell
                            cabin={cabin}
                            seatType={seatType}
                            seatFee={seatFee}
                            currency={currency.data!}
                            onChanged={seatFees.reload}
                          />
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface SeatFeeCellProps {
  cabin: Cabin
  seatType: SeatType
  seatFee?: SeatFee
  currency: string
  onChanged: () => void
}

function SeatFeeCell({ cabin, seatType, seatFee, currency, onChanged }: SeatFeeCellProps) {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const api = useAddOnChargesApi()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(seatFee ? String(Number(seatFee.amount)) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = `sf-${cabin}-${seatType}`
  const label = `${cabinLabel(cabin)} ${seatTypeLabel(seatType).toLowerCase()}`

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged() // the grid reloads and remounts this cell with the saved value
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!AMOUNT.test(amount) || Number(amount) > MAX_AMOUNT) {
      setError('0 or more, up to 2 decimals')
      return
    }
    void run(() => (seatFee ? api.updateSeatFee(seatFee.id, Number(amount)) : api.createSeatFee(cabin, seatType, Number(amount))))
  }

  function cancel() {
    setAmount(seatFee ? String(Number(seatFee.amount)) : '')
    setError(null)
    setEditing(false)
  }

  async function handleRemove() {
    if (!seatFee || !(await confirm(`Remove the ${label} seat fee?`))) return
    void run(() => api.deleteSeatFee(seatFee.id))
  }

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        type="button"
        className={seatFee ? 'w-full justify-end font-semibold' : 'w-full justify-end text-muted-foreground'}
        aria-label={`${label}: ${seatFee ? formatMoney(seatFee.amount, currency) : 'no fee set'}. Edit`}
        onClick={() => setEditing(true)}
      >
        {seatFee ? formatMoney(seatFee.amount, currency) : 'Not set'}
      </Button>
    )
  }

  return (
    <>
      <form className="pr-cell-form" onSubmit={handleSubmit} noValidate>
        <Label htmlFor={inputId} className="pr-visually-hidden">
          Seat fee for {label} in {currency}
        </Label>
        <Input
          id={inputId}
          className="pr-amount-input"
          inputMode="decimal"
          placeholder="0.00"
          autoFocus
          value={amount}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel()
          }}
        />
        <div className="pr-row-actions">
          <Button size="sm" type="submit" disabled={busy}>
            {seatFee ? 'Save' : 'Add'}
          </Button>
          {seatFee && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              type="button"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              Remove
            </Button>
          )}
          <Button variant="outline" size="sm" type="button" disabled={busy} onClick={cancel}>
            Cancel
          </Button>
        </div>
        {error && (
          <span id={`${inputId}-error`} className="pr-field-error" role="alert">
            {error}
          </span>
        )}
      </form>
      {confirmDialog}
    </>
  )
}
