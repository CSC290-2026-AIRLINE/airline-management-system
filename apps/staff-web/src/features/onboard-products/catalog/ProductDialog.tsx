// Add/Edit product dialog. Photo, name, sku, category, type code, dietary
// attributes, selling price, purchase cost, shelf life, and premium switch.
// Saves via the api layer and reports success/failure to the parent.

import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Switch } from '@staff-web/components/ui/switch'
import { Toggle } from '@staff-web/components/ui/toggle'
import { ImageInvalidError, ProductApiError, useOnboardApi } from '../api'
import type { DietaryAttribute, Product, ProductCategory, ProductInput, ProductPhoto, SpecialMealCode } from '../api/types'
import { PhotoPlaceholder } from './PhotoPlaceholder'

const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
  { value: 'meal', label: 'Meal' },
  { value: 'snack', label: 'Snacks & drinks' },
  { value: 'duty_free', label: 'Duty-free' },
]

const TYPE_CODES: SpecialMealCode[] = ['STD', 'VGML', 'MOML', 'KSML', 'DBML', 'GFML']

const DIETARY_OPTIONS: DietaryAttribute[] = ['halal', 'vegetarian', 'vegan', 'kosher', 'diabetic', 'gluten_free']

const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

interface Props {
  product: Product | null
  onClose: () => void
  onSaved: (saved: Product, isNew: boolean) => void
  onError: (message: string) => void
}

interface FormState {
  name: string
  sku: string
  category: ProductCategory
  typeCode: SpecialMealCode
  dietaryAttributes: DietaryAttribute[]
  priceAmount: string
  purchaseCostAmount: string
  shelfLifeDays: string
  isPremium: boolean
  isActive: boolean
  photo: ProductPhoto | null
}

type FormErrors = Partial<Record<keyof FormState, string>>

function emptyForm(): FormState {
  return {
    name: '',
    sku: '',
    category: 'meal',
    typeCode: 'STD',
    dietaryAttributes: [],
    priceAmount: '',
    purchaseCostAmount: '',
    shelfLifeDays: '',
    isPremium: false,
    isActive: true,
    photo: null,
  }
}

function formFromProduct(p: Product): FormState {
  return {
    name: p.name,
    sku: p.sku,
    category: p.category,
    typeCode: p.category === 'meal' ? p.typeCode : 'STD',
    dietaryAttributes: p.category === 'duty_free' ? [] : [...p.dietaryAttributes],
    priceAmount: p.priceAmount.toFixed(2),
    purchaseCostAmount: p.purchaseCostAmount == null ? '' : p.purchaseCostAmount.toFixed(2),
    shelfLifeDays: p.shelfLifeDays == null ? '' : String(p.shelfLifeDays),
    isPremium: p.category === 'meal' && p.isPremium,
    isActive: p.isActive,
    photo: null, // photo upload is a placeholder until the real image endpoint ships
  }
}

function parseNumber(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {}
  if (form.name.trim() === '') errors.name = 'Name is required.'
  if (form.sku.trim() === '') errors.sku = 'SKU is required.'

  const price = parseNumber(form.priceAmount)
  if (form.priceAmount.trim() === '') {
    errors.priceAmount = 'Selling price is required.'
  } else if (price == null || Number.isNaN(price) || price < 0) {
    errors.priceAmount = 'Selling price must be 0 or more.'
  }

  if (form.purchaseCostAmount.trim() !== '') {
    const cost = parseNumber(form.purchaseCostAmount)
    if (cost == null || Number.isNaN(cost) || cost < 0) {
      errors.purchaseCostAmount = 'Purchase cost must be 0 or more.'
    }
  }

  if (form.category !== 'duty_free') {
    if (form.shelfLifeDays.trim() === '') {
      errors.shelfLifeDays = 'Shelf life is required for food and beverages.'
    } else {
      const days = parseNumber(form.shelfLifeDays)
      if (days == null || Number.isNaN(days) || days <= 0 || !Number.isInteger(days)) {
        errors.shelfLifeDays = 'Shelf life must be a whole number of days.'
      }
    }
  }

  if (!TYPE_CODES.includes(form.typeCode)) {
    errors.typeCode = 'Pick a type code from the list.'
  }

  return errors
}

function toInput(form: FormState): ProductInput {
  const price = Number(form.priceAmount)
  const costRaw = form.purchaseCostAmount.trim()
  const daysRaw = form.shelfLifeDays.trim()
  return {
    name: form.name.trim(),
    sku: form.sku.trim(),
    category: form.category,
    typeCode: form.category === 'meal' ? form.typeCode : 'STD',
    dietaryAttributes: form.category === 'duty_free' ? [] : form.dietaryAttributes,
    priceAmount: price,
    purchaseCostAmount: costRaw === '' ? null : Number(costRaw),
    shelfLifeDays: form.category === 'duty_free' || daysRaw === '' ? null : Number(daysRaw),
    isPremium: form.category === 'meal' && form.isPremium,
    isActive: form.isActive,
    photo: form.photo,
  }
}

export function ProductDialog({ product, onClose, onSaved, onError }: Props) {
  const api = useOnboardApi()
  const isEdit = product !== null
  const [form, setForm] = useState<FormState>(() => (product ? formFromProduct(product) : emptyForm()))
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setCategory(category: ProductCategory) {
    setForm((prev) => ({
      ...prev,
      category,
      typeCode: category === 'meal' ? prev.typeCode : 'STD',
      isPremium: category === 'meal' && prev.isPremium,
      dietaryAttributes: category === 'duty_free' ? [] : prev.dietaryAttributes,
      shelfLifeDays: category === 'duty_free' ? '' : prev.shelfLifeDays,
    }))
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    setPhotoError(null)
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError('Photo must be JPEG, PNG or WebP.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photo must be at most 5 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setForm((prev) => ({ ...prev, photo: { dataUrl, fileName: file.name } }))
    }
    reader.readAsDataURL(file)
  }

  function toggleDietary(attr: DietaryAttribute) {
    setForm((prev) => {
      const has = prev.dietaryAttributes.includes(attr)
      return {
        ...prev,
        dietaryAttributes: has ? prev.dietaryAttributes.filter((a) => a !== attr) : [...prev.dietaryAttributes, attr],
      }
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (photoError) {
      // Don't submit while a photo error is showing.
      return
    }
    const next = validate(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      const saved = isEdit ? await api.products.update(product.id, toInput(form)) : await api.products.create(toInput(form))
      onSaved(saved, !isEdit)
    } catch (err) {
      if (err instanceof ImageInvalidError) {
        setPhotoError(err.message)
      } else if (err instanceof ProductApiError) {
        onError(err.message)
      } else {
        onError('Could not save the product.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const shelfLifeDisabled = form.category === 'duty_free'
  const photoSrc = form.photo?.dataUrl ?? null

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'Add product'}</DialogTitle>
          <DialogDescription>Prices are in USD and are charged through F5.</DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
          <section className="flex flex-col gap-2">
            <Label>Photo shown to customers</Label>
            <div className="flex flex-wrap items-center gap-4">
              {photoSrc ? (
                <img src={photoSrc} alt="" className="size-16 rounded-md border object-cover" />
              ) : (
                <PhotoPlaceholder product={{ id: 'preview', category: form.category, name: form.name || 'New product' }} size="md" />
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={onFileChange}
                  aria-label="Upload product photo"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  {photoSrc ? 'Replace photo' : 'Upload photo'}
                </Button>
                {photoSrc && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, photo: null }))
                      setPhotoError(null)
                    }}
                  >
                    Remove photo
                  </Button>
                )}
              </div>
            </div>
            {photoError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{photoError}</AlertDescription>
              </Alert>
            )}
            <p className="m-0 text-xs text-muted-foreground">
              JPEG, PNG or WebP, up to 5 MB. It is resized and shown on the customer's menu card.
            </p>
          </section>

          <Field id="pd-name" label="Name" error={errors.name}>
            <Input
              id="pd-name"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Chicken fried rice"
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
            />
          </Field>

          <Field id="pd-sku" label="SKU" error={errors.sku}>
            <Input
              id="pd-sku"
              value={form.sku}
              onChange={(e) => setField('sku', e.target.value)}
              placeholder="e.g. MEAL-CHICKEN-FRIED-RICE"
              autoComplete="off"
              aria-invalid={errors.sku ? true : undefined}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="pd-category" label="Category">
              <NativeSelect
                id="pd-category"
                className="w-full"
                value={form.category === 'beverage' ? 'snack' : form.category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <NativeSelectOption key={opt.value} value={opt.value}>
                    {opt.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="pd-price" label="Selling price (USD)" error={errors.priceAmount}>
              <Input
                id="pd-price"
                type="number"
                min="0"
                step="0.01"
                value={form.priceAmount}
                onChange={(e) => setField('priceAmount', e.target.value)}
                placeholder="0.00"
                aria-invalid={errors.priceAmount ? true : undefined}
              />
            </Field>
          </div>

          {form.category === 'meal' && (
            <Field id="pd-typecode" label="Special meal code" error={errors.typeCode}>
              <NativeSelect
                id="pd-typecode"
                className="w-full"
                value={form.typeCode}
                onChange={(e) => setField('typeCode', e.target.value as SpecialMealCode)}
              >
                {TYPE_CODES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}

          {form.category !== 'duty_free' && (
            <div className="flex flex-col gap-2">
              <Label>Dietary attributes</Label>
              <div className="flex flex-wrap gap-2">
                {DIETARY_OPTIONS.map((attr) => {
                  const active = form.dietaryAttributes.includes(attr)
                  return (
                    <Toggle
                      key={attr}
                      variant="outline"
                      size="sm"
                      pressed={active}
                      onPressedChange={() => toggleDietary(attr)}
                      className="capitalize"
                    >
                      {attr.replace('_', ' ')}
                    </Toggle>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="pd-cost" label="Purchase cost (USD)" error={errors.purchaseCostAmount}>
              <Input
                id="pd-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.purchaseCostAmount}
                onChange={(e) => setField('purchaseCostAmount', e.target.value)}
                placeholder="Optional"
                aria-invalid={errors.purchaseCostAmount ? true : undefined}
              />
            </Field>
            <Field
              id="pd-shelf"
              label={`Shelf life (days)${shelfLifeDisabled ? ' · disabled for duty-free' : ''}`}
              error={errors.shelfLifeDays}
            >
              <Input
                id="pd-shelf"
                type="number"
                min="1"
                step="1"
                value={form.shelfLifeDays}
                onChange={(e) => setField('shelfLifeDays', e.target.value)}
                placeholder={shelfLifeDisabled ? 'Not applicable' : 'e.g. 2'}
                disabled={shelfLifeDisabled}
                aria-invalid={errors.shelfLifeDays ? true : undefined}
              />
            </Field>
          </div>

          {form.category === 'meal' && (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <Label htmlFor="pd-premium">Premium meal</Label>
              <Switch id="pd-premium" checked={form.isPremium} onCheckedChange={(checked) => setField('isPremium', checked)} />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {isEdit ? 'Save changes' : 'Add product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A label, its control and the error under it. */
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
