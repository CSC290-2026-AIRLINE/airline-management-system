import { useState, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { ApiError, errorMessage } from '../api'
import { TAX_FEE_CALC_TYPES, TAX_FEE_KINDS, useAddOnChargesApi, type TaxFee, type TaxFeeInput } from '../add-on-charges/api'
import { calcTypeLabel, taxKindLabel } from '../add-on-charges/labels'
import { Dialog } from '../components/Dialog'

const ACTION_BUTTON = 'h-[42px] px-6 text-[13px] font-semibold max-[800px]:h-11'
const PRIMARY_BUTTON = `bg-(--pr-primary) hover:bg-(--pr-primary-hover) ${ACTION_BUTTON}`
export const OUTLINE_BUTTON = `border-(--pr-primary) bg-(--pr-surface) text-(--pr-primary) hover:bg-(--pr-tint) ${ACTION_BUTTON}`

interface FormState {
  code: string
  name: string
  kind: TaxFeeInput['kind']
  calc_type: TaxFeeInput['calc_type']
  value: string
  is_active: boolean
}

type FieldErrors = Partial<Record<keyof FormState, string>>

const EMPTY: FormState = { code: '', name: '', kind: 'tax', calc_type: 'flat', value: '', is_active: true }
const VALUE = /^\d+(\.\d{1,2})?$/

// Same rules as CreateTaxFeeDto and the TAX_FEE_PCT_TOO_HIGH check on the backend, which validates again.
function validate(form: FormState): { input?: TaxFeeInput; errors: FieldErrors } {
  const errors: FieldErrors = {}
  if (!/^[A-Z0-9_]{1,20}$/.test(form.code)) errors.code = 'Use A–Z, 0–9, _'
  if (!form.name.trim()) errors.name = 'Required'
  else if (form.name.length > 100) errors.name = 'At most 100 characters'
  if (!VALUE.test(form.value)) errors.value = '0 or more, up to 2 decimals'
  else if (form.calc_type === 'pct' && Number(form.value) > 100) errors.value = 'A percentage cannot be more than 100'
  if (Object.keys(errors).length) return { errors }
  return {
    errors,
    input: {
      code: form.code,
      name: form.name.trim(),
      kind: form.kind,
      calc_type: form.calc_type,
      value: Number(form.value),
      is_active: form.is_active,
    },
  }
}

interface TaxFeeDialogProps {
  taxFee: TaxFee | null // null = adding a new one
  currency: string
  onSaved: (taxFee: TaxFee) => void
  onRemoved: (taxFee: TaxFee) => void
  onClose: () => void
}

export function TaxFeeDialog({ taxFee, currency, onSaved, onRemoved, onClose }: TaxFeeDialogProps) {
  const api = useAddOnChargesApi()
  const [form, setForm] = useState<FormState>(
    taxFee
      ? {
          code: taxFee.code,
          name: taxFee.name,
          kind: taxFee.kind,
          calc_type: taxFee.calc_type,
          value: Number(taxFee.value).toFixed(2),
          is_active: taxFee.is_active,
        }
      : EMPTY,
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const unit = form.calc_type === 'pct' ? '%' : currency

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
      onSaved(taxFee ? await api.updateTaxFee(taxFee.id, input) : await api.createTaxFee(input))
    } catch (error) {
      // A duplicate code is shown on the code field itself; anything else goes in the callout.
      if (error instanceof ApiError && error.code === 'TAX_FEE_CODE_TAKEN') setErrors({ code: error.message })
      else if (error instanceof ApiError && error.code === 'TAX_FEE_PCT_TOO_HIGH') setErrors({ value: error.message })
      else setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!taxFee || !window.confirm(`Remove ${taxFee.code} · ${taxFee.name}?`)) return
    setBusy(true)
    setServerError(null)
    try {
      await api.deleteTaxFee(taxFee.id)
      onRemoved(taxFee)
    } catch (error) {
      setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  function fieldProps(field: keyof FormState) {
    return {
      id: `tax-fee-${field}`,
      disabled: busy,
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': errors[field] ? `tax-fee-${field}-error` : undefined,
    }
  }

  return (
    <Dialog labelledBy="tax-fee-title" className="pr-confirm pr-form-dialog" onClose={() => !busy && onClose()}>
      <div className="pr-sheet-handle" aria-hidden="true" />
      <form className="flex flex-col gap-3.5" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="pr-confirm-head mb-0!">
          <h2 id="tax-fee-title">{taxFee ? `Edit ${taxFee.code}` : 'New tax, surcharge or fee'}</h2>
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

        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 max-[800px]:grid-cols-2">
          <Field htmlFor="tax-fee-code" label="Code" error={errors.code}>
            <Input
              {...fieldProps('code')}
              className="h-[42px]"
              value={form.code}
              maxLength={20}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
            />
          </Field>
          <Field htmlFor="tax-fee-name" label="Name" error={errors.name}>
            <Input
              {...fieldProps('name')}
              className="h-[42px]"
              value={form.name}
              maxLength={100}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="tax-fee-kind" label="Kind">
            <NativeSelect
              id="tax-fee-kind"
              className="w-full [&_select]:h-[42px]"
              value={form.kind}
              disabled={busy}
              onChange={(e) => set('kind', e.target.value as FormState['kind'])}
            >
              {TAX_FEE_KINDS.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {taxKindLabel(kind)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field htmlFor="tax-fee-calc_type" label="Calculation">
            <NativeSelect
              id="tax-fee-calc_type"
              className="w-full [&_select]:h-[42px]"
              value={form.calc_type}
              disabled={busy}
              onChange={(e) => set('calc_type', e.target.value as FormState['calc_type'])}
            >
              {TAX_FEE_CALC_TYPES.map((calcType) => (
                <NativeSelectOption key={calcType} value={calcType}>
                  {calcTypeLabel(calcType)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>

        {/* Desktop shows the unit in the label, phone inside the field, as in the design. */}
        <Field
          htmlFor="tax-fee-value"
          label={
            <>
              Value<span className="max-[800px]:hidden"> ({unit})</span>
            </>
          }
          error={errors.value}
        >
          <span className="relative block">
            <Input
              {...fieldProps('value')}
              className="h-[42px] tabular-nums max-[800px]:pr-12!"
              inputMode="decimal"
              value={form.value}
              onChange={(e) => set('value', e.target.value)}
            />
            <span
              className="pointer-events-none absolute top-1/2 right-3.5 hidden -translate-y-1/2 text-xs text-(--pr-muted) max-[800px]:block"
              aria-hidden="true"
            >
              {unit}
            </span>
          </span>
        </Field>

        <Label className="w-fit text-[13px] leading-[normal] font-normal text-(--pr-primary)">
          <Checkbox
            className="size-[18px] data-checked:border-(--pr-primary) data-checked:bg-(--pr-primary)"
            checked={form.is_active}
            disabled={busy}
            onCheckedChange={(checked) => set('is_active', checked)}
          />
          Active
        </Label>

        {serverError && (
          <div className="pr-callout is-error" role="alert">
            {serverError}
          </div>
        )}

        {/* pr-confirm-actions stacks these on phones, primary on top. */}
        <div className="pr-confirm-actions">
          {taxFee && (
            <Button
              type="button"
              variant="ghost"
              className={`mr-auto text-(--pr-danger) hover:bg-(--pr-danger-bg) hover:text-(--pr-danger) ${ACTION_BUTTON}`}
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              Remove
            </Button>
          )}
          <Button type="button" variant="outline" className={OUTLINE_BUTTON} disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
            {busy ? 'Saving…' : taxFee ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

interface FieldProps {
  htmlFor: string
  label: ReactNode
  error?: string
  children: ReactNode
}

function Field({ htmlFor, label, error, children }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="block text-[11px] leading-[normal] font-semibold text-(--pr-muted) uppercase">
        {label}
      </Label>
      {children}
      {error && (
        <span id={`${htmlFor}-error`} className="text-xs text-(--pr-danger)">
          {error}
        </span>
      )}
    </div>
  )
}
