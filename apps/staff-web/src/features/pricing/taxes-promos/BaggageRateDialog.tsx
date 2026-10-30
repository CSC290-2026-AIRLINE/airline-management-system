import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { ApiError, errorMessage, type FareClass, type RouteOption } from '../api'
import { useAddOnChargesApi, type BaggageRate, type BaggageRateInput } from '../add-on-charges/api'
import { routeLabel } from '../add-on-charges/labels'
import { Dialog } from '../components/Dialog'
import { DANGER_BUTTON, OUTLINE_BUTTON, PRIMARY_BUTTON } from './charge-styles'
import { FormField } from './FormField'

export const KG = /^\d+(\.\d)?$/ // NUMERIC(5,1)
export const MONEY = /^\d+(\.\d{1,2})?$/

interface FormState {
  fare_class_id: string
  route_id: string // '' = all routes
  free_allowance_kg: string
  rate_per_kg: string
  max_bag_kg: string // '' = no limit
}

type FieldErrors = Partial<Record<keyof FormState, string>>

// Same rules as CreateBaggageRateDto and the BAGGAGE_RATE_INVALID check on the backend, which validates again.
function validate(form: FormState): { input?: BaggageRateInput; errors: FieldErrors } {
  const errors: FieldErrors = {}
  if (!form.fare_class_id) errors.fare_class_id = 'Pick a fare class'
  if (!KG.test(form.free_allowance_kg)) errors.free_allowance_kg = '0 or more, up to 1 decimal'
  if (!MONEY.test(form.rate_per_kg)) errors.rate_per_kg = '0 or more, up to 2 decimals'
  if (form.max_bag_kg !== '' && (!KG.test(form.max_bag_kg) || Number(form.max_bag_kg) <= 0)) {
    errors.max_bag_kg = 'Above 0, or empty for no limit'
  }
  if (!errors.free_allowance_kg && !errors.max_bag_kg && form.max_bag_kg !== '') {
    if (Number(form.free_allowance_kg) >= Number(form.max_bag_kg)) errors.free_allowance_kg = 'Must be less than max bag'
  }
  if (Object.keys(errors).length) return { errors }
  return {
    errors,
    input: {
      fare_class_id: form.fare_class_id,
      route_id: form.route_id || null,
      free_allowance_kg: Number(form.free_allowance_kg),
      rate_per_kg: Number(form.rate_per_kg),
      max_bag_kg: form.max_bag_kg === '' ? null : Number(form.max_bag_kg),
    },
  }
}

interface BaggageRateDialogProps {
  rate: BaggageRate | null // null = adding a new one
  fareClasses: FareClass[]
  routes: RouteOption[]
  currency: string
  onSaved: (rate: BaggageRate) => void
  onRemoved: (rate: BaggageRate) => void
  onClose: () => void
}

// The design has no add or edit form for baggage rates, so this follows the "New tax, surcharge or fee" dialog.
export function BaggageRateDialog({ rate, fareClasses, routes, currency, onSaved, onRemoved, onClose }: BaggageRateDialogProps) {
  const api = useAddOnChargesApi()
  const [form, setForm] = useState<FormState>(
    rate
      ? {
          fare_class_id: rate.fare_class_id,
          route_id: rate.route_id ?? '',
          free_allowance_kg: String(Number(rate.free_allowance_kg)),
          rate_per_kg: Number(rate.rate_per_kg).toFixed(2),
          max_bag_kg: rate.max_bag_kg === null ? '' : String(Number(rate.max_bag_kg)),
        }
      : { fare_class_id: fareClasses[0]?.id ?? '', route_id: '', free_allowance_kg: '20', rate_per_kg: '', max_bag_kg: '32' },
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const { input, errors: found } = validate(form)
    setErrors(found)
    setServerError(null)
    if (!input) return
    setBusy(true)
    try {
      onSaved(rate ? await api.updateBaggageRate(rate.id, input) : await api.createBaggageRate(input))
    } catch (error) {
      // A duplicate means this fare class already has a rate for the chosen route (or an all-routes one).
      if (error instanceof ApiError && error.code === 'BAGGAGE_RATE_EXISTS') setErrors({ route_id: error.message })
      else if (error instanceof ApiError && error.code === 'BAGGAGE_RATE_INVALID') setErrors({ free_allowance_kg: error.message })
      else setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!rate || !window.confirm(`Remove the ${rate.fare_class.code} baggage rate for ${routeLabel(rate.route)}?`)) return
    setBusy(true)
    setServerError(null)
    try {
      await api.deleteBaggageRate(rate.id)
      onRemoved(rate)
    } catch (error) {
      setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  function fieldProps(field: keyof FormState) {
    return {
      id: `baggage-${field}`,
      disabled: busy,
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': errors[field] ? `baggage-${field}-error` : undefined,
    }
  }

  return (
    <Dialog labelledBy="baggage-rate-title" className="pr-confirm pr-form-dialog" onClose={() => !busy && onClose()}>
      <div className="pr-sheet-handle" aria-hidden="true" />
      <form className="flex flex-col gap-3.5" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="pr-confirm-head mb-0!">
          <h2 id="baggage-rate-title">{rate ? `Edit ${rate.fare_class.code} · ${routeLabel(rate.route)}` : 'New baggage rate'}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pr-phone-only text-(--pr-muted)"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField htmlFor="baggage-fare_class_id" label="Class" error={errors.fare_class_id}>
            <NativeSelect
              {...fieldProps('fare_class_id')}
              className="w-full [&_select]:h-[42px]"
              value={form.fare_class_id}
              onChange={(e) => set('fare_class_id', e.target.value)}
            >
              {fareClasses.map((fareClass) => (
                <NativeSelectOption key={fareClass.id} value={fareClass.id}>
                  {fareClass.code} · {fareClass.name}
                  {fareClass.is_active ? '' : ' (inactive)'}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor="baggage-route_id" label="Route" error={errors.route_id}>
            <NativeSelect
              {...fieldProps('route_id')}
              className="w-full [&_select]:h-[42px]"
              value={form.route_id}
              onChange={(e) => set('route_id', e.target.value)}
            >
              <NativeSelectOption value="">All routes</NativeSelectOption>
              {routes.map((route) => (
                <NativeSelectOption key={route.id} value={route.id}>
                  {routeLabel(route)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-3 max-[800px]:grid-cols-2">
          <FormField htmlFor="baggage-free_allowance_kg" label="Free (kg)" error={errors.free_allowance_kg}>
            <Input
              {...fieldProps('free_allowance_kg')}
              className="h-[42px]"
              inputMode="decimal"
              value={form.free_allowance_kg}
              onChange={(e) => set('free_allowance_kg', e.target.value)}
            />
          </FormField>
          <FormField htmlFor="baggage-rate_per_kg" label={`Per extra kg (${currency})`} error={errors.rate_per_kg}>
            <Input
              {...fieldProps('rate_per_kg')}
              className="h-[42px]"
              inputMode="decimal"
              value={form.rate_per_kg}
              onChange={(e) => set('rate_per_kg', e.target.value)}
            />
          </FormField>
          <FormField htmlFor="baggage-max_bag_kg" label="Max bag (kg)" error={errors.max_bag_kg}>
            <Input
              {...fieldProps('max_bag_kg')}
              className="h-[42px]"
              inputMode="decimal"
              placeholder="No limit"
              value={form.max_bag_kg}
              onChange={(e) => set('max_bag_kg', e.target.value)}
            />
          </FormField>
        </div>

        <p className="text-xs leading-[normal] text-(--pr-muted)">
          Extra weight is rounded up to a whole kg. A bag over the max is refused.
        </p>

        {serverError && (
          <div className="pr-callout is-error" role="alert">
            {serverError}
          </div>
        )}

        {/* pr-confirm-actions stacks these on phones, primary on top. */}
        <div className="pr-confirm-actions">
          {rate && (
            <Button type="button" variant="ghost" className={DANGER_BUTTON} disabled={busy} onClick={() => void handleRemove()}>
              Remove
            </Button>
          )}
          <Button type="button" variant="outline" className={OUTLINE_BUTTON} disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
            {busy ? 'Saving…' : rate ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
