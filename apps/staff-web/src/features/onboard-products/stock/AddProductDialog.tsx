// Small inline add-product dialog used from the Receive delivery page.
// Lets the user create a one-off product without leaving the page, so
// the new line can be added to the same delivery.

/* eslint-disable react-hooks/set-state-in-effect -- reset validation error as the form changes */

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { ProductApiError, useOnboardApi } from '../api'
import { addDays } from '../dates'
import type { Product, ProductCategory, ProductInput } from '../api/types'

type CategoryChoice = 'meal' | 'snacks_drinks' | 'duty_free'

interface FormState {
  name: string
  category: CategoryChoice
  unitCost: string
  sellingPrice: string
  expiresAt: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

function emptyForm(): FormState {
  return { name: '', category: 'meal', unitCost: '', sellingPrice: '', expiresAt: defaultExpiryFor('meal') }
}

function defaultExpiryFor(category: CategoryChoice): string {
  if (category === 'duty_free') return ''
  const days = category === 'meal' ? 2 : 180
  return addDays(days).slice(0, 10) // input[type=date] wants YYYY-MM-DD
}

function categoryFromChoice(choice: CategoryChoice): ProductCategory {
  if (choice === 'meal') return 'meal'
  if (choice === 'duty_free') return 'duty_free'
  return 'snack' // treat Snacks & drinks as a snack by default
}

function parseNumber(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

function autoSku(name: string, category: CategoryChoice): string {
  const cleaned = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const prefix = category === 'meal' ? 'MEAL' : category === 'duty_free' ? 'DF' : 'SNACK'
  return `${prefix}-${cleaned || 'NEW-ITEM'}-${Date.now().toString(36).toUpperCase()}`
}

interface Props {
  onClose: () => void
  onSaved: (product: Product) => void
  onError: (message: string) => void
}

export function AddProductDialog({ onClose, onSaved, onError }: Props) {
  const api = useOnboardApi()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setCategory(category: CategoryChoice) {
    setForm((prev) => ({
      ...prev,
      category,
      expiresAt: category === 'duty_free' ? '' : defaultExpiryFor(category),
    }))
  }

  // Reset validation errors as the user edits.
  useEffect(() => {
    setErrors({})
  }, [form])

  const expiresDisabled = form.category === 'duty_free'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: FormErrors = {}
    if (form.name.trim() === '') next.name = 'Name is required.'
    const cost = parseNumber(form.unitCost)
    if (form.unitCost.trim() === '' || cost == null || Number.isNaN(cost) || cost < 0) {
      next.unitCost = 'Unit cost must be 0 or more.'
    }
    const price = parseNumber(form.sellingPrice)
    if (form.sellingPrice.trim() === '' || price == null || Number.isNaN(price) || price < 0) {
      next.sellingPrice = 'Selling price must be 0 or more.'
    }
    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }
    const category = categoryFromChoice(form.category)
    const shelfLifeDays = form.expiresAt === '' ? null : Math.max(1, daysFromNow(form.expiresAt))
    const input: ProductInput = {
      name: form.name.trim(),
      sku: autoSku(form.name, form.category),
      category,
      typeCode: 'STD',
      dietaryAttributes: [],
      priceAmount: price as number,
      purchaseCostAmount: cost as number,
      shelfLifeDays,
      isPremium: false,
      isActive: true,
      photo: null,
    }
    setSubmitting(true)
    try {
      const created = await api.products.create(input)
      onSaved(created)
    } catch (err) {
      if (err instanceof ProductApiError) {
        setErrors({ name: err.message })
        onError(err.message)
      } else {
        onError('Could not save the product.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const daysFromNowFn = useMemo(() => (iso: string) => daysFromNow(iso), [])

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a new product</DialogTitle>
          <DialogDescription>
            Add a one-off item to the catalog so you can receive it on this delivery. You can edit it later under Product Catalog.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <FormField id="apd-name" label="Name" error={errors.name}>
            <Input
              id="apd-name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Chicken fried rice"
              autoComplete="off"
              autoFocus
              disabled={submitting}
              aria-invalid={errors.name ? true : undefined}
            />
          </FormField>

          <FormField
            id="apd-category"
            label="Category"
            hint={
              form.category === 'meal'
                ? 'Expiry defaults to 2 days after receipt.'
                : form.category === 'snacks_drinks'
                  ? 'Expiry defaults to 180 days after receipt.'
                  : 'Duty-free items do not expire.'
            }
          >
            <NativeSelect
              id="apd-category"
              className="w-full"
              value={form.category}
              onChange={(e) => setCategory(e.target.value as CategoryChoice)}
              disabled={submitting}
            >
              <NativeSelectOption value="meal">Meals</NativeSelectOption>
              <NativeSelectOption value="snacks_drinks">Snacks & drinks</NativeSelectOption>
              <NativeSelectOption value="duty_free">Duty-free</NativeSelectOption>
            </NativeSelect>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="apd-cost" label="Unit cost (USD)" error={errors.unitCost}>
              <Input
                id="apd-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.unitCost}
                onChange={(e) => setField('unitCost', e.target.value)}
                placeholder="0.00"
                disabled={submitting}
                aria-invalid={errors.unitCost ? true : undefined}
              />
            </FormField>
            <FormField id="apd-price" label="Selling price (USD)" error={errors.sellingPrice}>
              <Input
                id="apd-price"
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => setField('sellingPrice', e.target.value)}
                placeholder="0.00"
                disabled={submitting}
                aria-invalid={errors.sellingPrice ? true : undefined}
              />
            </FormField>
          </div>

          <FormField
            id="apd-expiry"
            label={`Expiry${expiresDisabled ? ' · not applicable for duty-free' : ''}`}
            hint={form.expiresAt !== '' ? `${daysFromNowFn(form.expiresAt)} days after today` : undefined}
          >
            <Input
              id="apd-expiry"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setField('expiresAt', e.target.value)}
              disabled={expiresDisabled || submitting}
            />
          </FormField>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Add product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A label, its control, an optional hint and the error under it. */
function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <p className="m-0 text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function daysFromNow(iso: string): number {
  const today = new Date(addDays(0).slice(0, 10))
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return 0
  const ms = target.getTime() - today.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}
