import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import type { StaffApi } from '../api/index.ts'
import type { StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { messageOf, numberOrNull } from './errors.ts'
import { GATE_ACTIVE, GATE_IDLE, INPUT_LABEL, MUTED, PANEL, PANEL_TITLE, SECONDARY_BUTTON, TEXT_INPUT } from './styles.ts'

interface Props {
  api: StaffApi
  view: StaffCheckInView
  onUpdated: (view: StaffCheckInView) => void
}

export function CarryOnForm({ api, view, onUpdated }: Props) {
  const { carryOn, carryOnCheck } = view
  const [weight, setWeight] = useState('')
  /** null until the agent answers the sizer question. */
  const [fits, setFits] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = async () => {
    const weightKg = numberOrNull(weight)
    if (weightKg === null || weightKg <= 0) {
      setError('Enter the weight of the carry-on in kg.')
      return
    }
    if (fits === null) {
      setError('Say whether the carry-on fits the sizer.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The API takes the three dimensions, so the sizer gives them: over the sizer is one centimetre too long.
      const dims = fits
        ? { lengthCm: carryOn.maxLengthCm, widthCm: carryOn.maxWidthCm, heightCm: carryOn.maxHeightCm }
        : { lengthCm: carryOn.maxLengthCm + 1, widthCm: carryOn.maxWidthCm, heightCm: carryOn.maxHeightCm }
      onUpdated(await api.carryOn(view.checkIn.id, { weightKg, ...dims }))
      setWeight('')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={`${PANEL} print:hidden`}>
      <h2 className={PANEL_TITLE}>Carry-on check</h2>
      <p className={MUTED}>
        {carryOn.maxKg} kg and {carryOn.maxLengthCm} × {carryOn.maxWidthCm} × {carryOn.maxHeightCm} cm for every cabin. A carry-on that is
        too big must be checked in and weighed as a checked bag.
      </p>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="carryon-weight" className={INPUT_LABEL}>
            Carry-on weight (kg)
          </Label>
          <Input
            id="carryon-weight"
            className={`${TEXT_INPUT} w-[220px]`}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="0.0"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className={INPUT_LABEL}>
            Fits the sizer ({carryOn.maxLengthCm} × {carryOn.maxWidthCm} × {carryOn.maxHeightCm} cm)?
          </span>
          <div className="flex items-center gap-2" role="group" aria-label="Fits the sizer">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={fits === true}
              className={fits === true ? GATE_ACTIVE : GATE_IDLE}
              onClick={() => setFits(true)}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={fits === false}
              className={fits === false ? GATE_ACTIVE : GATE_IDLE}
              onClick={() => setFits(false)}
            >
              No
            </Button>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className={SECONDARY_BUTTON} disabled={busy} onClick={() => void check()}>
          Record carry-on
        </Button>
      </div>

      {carryOnCheck ? (
        <p className={MUTED}>
          {carryOnCheck.result === 'ok'
            ? `Within the allowance · ${carryOnCheck.weightKg} kg · within the size limit`
            : `Must be checked at the gate · ${carryOnCheck.weightKg} kg · ${
                carryOnCheck.withinSize ? 'over the weight limit' : 'over the size limit'
              }`}
        </p>
      ) : (
        <p className={MUTED}>The carry-on has not been checked yet.</p>
      )}
    </Card>
  )
}
