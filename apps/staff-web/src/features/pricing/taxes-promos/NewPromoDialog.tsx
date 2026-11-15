import { useState, type FormEvent, type ReactNode } from 'react'
import { errorMessage, usePricingApi, type NewPromoCode, type PromoCode, type PromoKind } from '../api'
import { Dialog } from '../components/Dialog'
import { kindLabel } from './promo-format'
import { Button } from '@staff-web/components/ui/button'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { FormField } from './FormField'
import { Input } from '@staff-web/components/ui/input'
import { DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'

// Limits mirror CreatePromoCodeDto and the service checks, which validate again.
const CODE = /^[A-Z0-9_]{1,20}$/
const AMOUNT = /^\d+(\.\d{1,2})?$/
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)

type DiscountType = 'pct' | 'amount'
type Field = 'code' | 'discount' | 'validFrom' | 'validTo' | 'maxUses'

interface Form {
  code: string
  kind: PromoKind
  discountType: DiscountType
  discount: string
  validFrom: string // YYYY-MM-DD
  validTo: string
  maxUses: string
}

const EMPTY: Form = { code: '', kind: 'promo', discountType: 'pct', discount: '', validFrom: '', validTo: '', maxUses: '' }

// The form picks whole days in the staff member's timezone: from the start of the first day to the end of the last.
// The backend's valid_to is exclusive, so that end is midnight at the start of the next day.
function startOfDay(date: string, addDays = 0): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day + addDays).toISOString()
}

interface NewPromoDialogProps {
  currency: string
  onClose: () => void
  onCreated: (promo: PromoCode) => void
}

export function NewPromoDialog({ currency, onClose, onCreated }: NewPromoDialogProps) {
  const api = usePricingApi()
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function set<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  // Returns the request body, or null after marking the fields that need fixing.
  function validate(): NewPromoCode | null {
    const found: Partial<Record<Field, string>> = {}
    if (!CODE.test(form.code)) found.code = '1–20 uppercase letters, digits or _'

    const discount = Number(form.discount)
    const isPercent = form.discountType === 'pct'
    if (!AMOUNT.test(form.discount) || discount <= 0 || discount > (isPercent ? 100 : MAX_AMOUNT)) {
      found.discount = isPercent ? 'Above 0, up to 100' : 'Above 0, up to 2 decimals'
    }

    if (!form.validFrom) found.validFrom = 'Pick a date'
    if (!form.validTo) found.validTo = 'Pick a date'
    if (form.validFrom && form.validTo && form.validFrom > form.validTo) found.validTo = 'Must be on or after the start'

    if (form.maxUses && (!/^\d+$/.test(form.maxUses) || Number(form.maxUses) < 1)) found.maxUses = 'A whole number, 1 or more'

    setErrors(found)
    if (Object.keys(found).length) return null
    return {
      code: form.code,
      kind: form.kind,
      ...(isPercent ? { discount_pct: discount } : { discount_amount: discount }),
      valid_from: startOfDay(form.validFrom),
      valid_to: startOfDay(form.validTo, 1),
      ...(form.maxUses && { max_uses: Number(form.maxUses) }),
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaveError(null)
    const body = validate()
    if (!body) return
    setSaving(true)
    try {
      onCreated(await api.createPromoCode(body))
    } catch (e) {
      setSaveError(errorMessage(e))
      setSaving(false)
    }
  }

  function field(id: Field, label: string, input: ReactNode) {
    return (
      <FormField htmlFor={`promo-${id}`} label={label} error={errors[id]}>
        {input}
      </FormField>
    )
  }

  function inputProps(id: Field) {
    return {
      id: `promo-${id}`,
      disabled: saving,
      'aria-invalid': errors[id] ? true : undefined,
      'aria-describedby': errors[id] ? `promo-${id}-error` : undefined,
    }
  }

  return (
    <Dialog onClose={() => !saving && onClose()}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <DialogHeader>
          <DialogTitle>New promo or corporate code</DialogTitle>
        </DialogHeader>

        {field(
          'code',
          'Code',
          <Input
            {...inputProps('code')}
            className="h-[42px]"
            value={form.code}
            maxLength={20}
            placeholder="e.g. SPRING15"
            onChange={(e) => set('code', e.target.value.toUpperCase())}
          />,
        )}

        <div className="grid grid-cols-3 gap-3 max-[800px]:grid-cols-1">
          <FormField htmlFor="promo-kind" label="Kind">
            <NativeSelect
              id="promo-kind"
              className="w-full [&_select]:h-[42px]"
              value={form.kind}
              disabled={saving}
              onChange={(e) => set('kind', e.target.value as PromoKind)}
            >
              {(['promo', 'corporate'] as const).map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {kindLabel(kind)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor="promo-type" label="Discount type">
            <NativeSelect
              id="promo-type"
              className="w-full [&_select]:h-[42px]"
              value={form.discountType}
              disabled={saving}
              onChange={(e) => set('discountType', e.target.value as DiscountType)}
            >
              <NativeSelectOption value="pct">Percentage</NativeSelectOption>
              <NativeSelectOption value="amount">Fixed amount</NativeSelectOption>
            </NativeSelect>
          </FormField>
          {field(
            'discount',
            `Discount (${form.discountType === 'pct' ? '%' : currency})`,
            <Input
              {...inputProps('discount')}
              className="h-[42px]"
              inputMode="decimal"
              value={form.discount}
              onChange={(e) => set('discount', e.target.value)}
            />,
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field(
            'validFrom',
            'Valid from',
            <Input
              {...inputProps('validFrom')}
              className="h-[42px]"
              type="date"
              value={form.validFrom}
              onChange={(e) => set('validFrom', e.target.value)}
            />,
          )}
          {field(
            'validTo',
            'Valid to',
            <Input
              {...inputProps('validTo')}
              className="h-[42px]"
              type="date"
              value={form.validTo}
              onChange={(e) => set('validTo', e.target.value)}
            />,
          )}
        </div>

        {field(
          'maxUses',
          'Max uses (empty = unlimited)',
          <Input
            {...inputProps('maxUses')}
            className="h-[42px]"
            inputMode="numeric"
            value={form.maxUses}
            onChange={(e) => set('maxUses', e.target.value)}
          />,
        )}

        <p className="rounded-md bg-muted px-3 py-2.5 text-xs text-muted-foreground">
          New codes start active. A future start date shows as Not started.
        </p>

        {saveError && (
          <Alert variant="destructive">
            <AlertDescription className="block">{saveError}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save code'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
