import { useState } from 'react'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { useAddOnChargesApi, type BaggageCharge, type BaggageRate } from '../add-on-charges/api'
import { routeLabel } from '../add-on-charges/labels'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { FormField } from './FormField'

const WEIGHT = /^\d+(\.\d+)?$/

function resultText(charge: BaggageCharge, currency: string): string {
  if (charge.chargeable_kg === 0) return `Within ${charge.free_allowance_kg} kg free = 0.00 ${currency}`
  return `${charge.chargeable_kg} kg extra × ${charge.rate_per_kg.toFixed(2)} = ${charge.charge.toFixed(2)} ${currency}`
}

interface TryFeeProps {
  rates: BaggageRate[]
  currency: string
}

// Dry run: asks the backend, so staff see exactly what bag drop will charge. Inactive rows are left out because the backend skips them.
export function TryFee({ rates, currency }: TryFeeProps) {
  const api = useAddOnChargesApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  const [rateId, setRateId] = useState('')
  const [weight, setWeight] = useState('')
  const active = rates.filter((rate) => rate.is_active)
  const rate = active.find((candidate) => candidate.id === rateId) ?? active[0]
  const canCalculate = rate !== undefined && WEIGHT.test(weight) && Number(weight) > 0
  // The rate's numbers are in the key so the result follows an edit in the table above.
  const charge = useLoad(
    () => (canCalculate ? api.baggageCharge(rate.fare_class_id, Number(weight), rate.route_id ?? undefined) : Promise.resolve(null)),
    `charge:${rate?.id}:${rate?.free_allowance_kg}:${rate?.rate_per_kg}:${rate?.max_bag_kg}:${weight}`,
  )

  if (!rate) return null

  return (
    <form
      className="flex items-end gap-4 rounded-(--pr-radius-field) border border-(--pr-border) bg-(--pr-page) p-4 max-[800px]:flex-col max-[800px]:items-stretch max-[800px]:gap-2 max-[800px]:border-(--pr-divider) max-[800px]:bg-(--pr-tint) max-[800px]:p-3"
      aria-label="Try a fee"
      onSubmit={(event) => event.preventDefault()}
    >
      {isPhone ? (
        <p className="text-xs leading-[normal] font-semibold text-(--pr-muted)">Try a fee · Dry run</p>
      ) : (
        <div className="flex shrink-0 flex-col gap-0.5 self-center leading-[normal]">
          <p className="text-sm font-bold text-(--pr-primary)">Try a fee</p>
          <p className="text-xs text-(--pr-muted)">Dry run</p>
        </div>
      )}

      <div className="w-[200px] shrink-0 max-[800px]:w-full">
        <FormField htmlFor="try-fee-rate" label="Rate row">
          <NativeSelect
            id="try-fee-rate"
            className="w-full [&_select]:h-[42px]"
            value={rate.id}
            onChange={(event) => setRateId(event.target.value)}
          >
            {active.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.fare_class.code} · {routeLabel(option.route)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="w-[150px] shrink-0 max-[800px]:w-full">
        <FormField htmlFor="try-fee-weight" label="Weighed bags">
          <span className="relative block">
            <Input
              id="try-fee-weight"
              className="h-[42px] pr-10! tabular-nums"
              inputMode="decimal"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
            <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-(--pr-muted)" aria-hidden="true">
              kg
            </span>
          </span>
        </FormField>
      </div>

      <output
        className="flex min-h-[42px] min-w-0 flex-1 items-center rounded-(--pr-radius-field) border border-(--pr-border) bg-(--pr-surface) px-4 py-2 text-[13px] leading-[normal] font-bold text-(--pr-primary) max-[800px]:px-3"
        aria-live="polite"
      >
        {weight === '' ? (
          <span className="font-normal text-(--pr-muted)">Enter a weight</span>
        ) : !canCalculate ? (
          <span className="text-(--pr-danger)">Enter a weight above 0 kg</span>
        ) : charge.error ? (
          <span className="text-(--pr-danger)">{charge.error}</span>
        ) : charge.data ? (
          resultText(charge.data, currency)
        ) : (
          <span className="font-normal text-(--pr-muted)">Calculating…</span>
        )}
      </output>
    </form>
  )
}
