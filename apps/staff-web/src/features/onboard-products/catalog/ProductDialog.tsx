// Add/Edit product dialog. Photo, name, sku, category, type code, dietary
// attributes, selling price, purchase cost, shelf life, and premium switch.
// Saves via the api layer and reports success/failure to the parent.

import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ImageInvalidError, ProductApiError, useOnboardApi } from '../api'
import type { DietaryAttribute, Product, ProductCategory, ProductInput, ProductPhoto, SpecialMealCode } from '../api/types'
import { PhotoPlaceholder } from './PhotoPlaceholder'
import { useDialogFocusTrap } from './useDialogFocusTrap'
import styles from './ProductDialog.module.css'

const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
  { value: 'meal', label: 'Meal' },
  { value: 'snack', label: 'Snack and drink' },
  { value: 'beverage', label: 'Snack and drink' },
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
    typeCode: p.typeCode,
    dietaryAttributes: [...p.dietaryAttributes],
    priceAmount: p.priceAmount.toFixed(2),
    purchaseCostAmount: p.purchaseCostAmount == null ? '' : p.purchaseCostAmount.toFixed(2),
    shelfLifeDays: p.shelfLifeDays == null ? '' : String(p.shelfLifeDays),
    isPremium: p.isPremium,
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
    typeCode: form.typeCode,
    dietaryAttributes: form.dietaryAttributes,
    priceAmount: price,
    purchaseCostAmount: costRaw === '' ? null : Number(costRaw),
    shelfLifeDays: form.category === 'duty_free' || daysRaw === '' ? null : Number(daysRaw),
    isPremium: form.isPremium,
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
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const headingId = useId()
  useDialogFocusTrap(true, dialogRef, onClose)

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setCategory(category: ProductCategory) {
    // Changing category clears fields that only make sense for other categories,
    // so the constraints (type code only for meals, shelf life not for duty-free)
    // are kept on the form rather than recomputed later.
    setForm((prev) => {
      const next: FormState = { ...prev, category }
      if (category !== 'meal' && prev.typeCode !== 'STD') {
        next.typeCode = 'STD'
      }
      if (category === 'duty_free' && prev.shelfLifeDays !== '') {
        next.shelfLifeDays = ''
      }
      return next
    })
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

  const typeCodeDisabled = form.category !== 'meal'
  const shelfLifeDisabled = form.category === 'duty_free'
  const photoSrc = form.photo?.dataUrl ?? null

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className={styles.header}>
          <h2 id={headingId} className={styles.title}>
            {isEdit ? 'Edit product' : 'Add product'}
          </h2>
          <p className={styles.subtitle}>Prices are in USD and are charged through F5.</p>
        </header>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <section className={styles.photoBlock}>
            <p className={styles.label}>Photo shown to customers</p>
            <div className={styles.photoRow}>
              {photoSrc ? (
                <img src={photoSrc} alt="" className={styles.photoPreview} />
              ) : (
                <PhotoPlaceholder
                  product={{
                    id: 'preview',
                    category: form.category,
                    name: form.name || 'New product',
                  }}
                  size="md"
                />
              )}
              <div className={styles.photoButtons}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className={styles.fileInput}
                  onChange={onFileChange}
                  aria-label="Upload product photo"
                />
                <button type="button" className={styles.photoButton} onClick={() => fileInputRef.current?.click()}>
                  {photoSrc ? 'Replace photo' : 'Upload photo'}
                </button>
                {photoSrc && (
                  <button
                    type="button"
                    className={`${styles.photoButton} ${styles.photoButtonDanger}`}
                    onClick={() => {
                      setForm((prev) => ({ ...prev, photo: null }))
                      setPhotoError(null)
                    }}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            {photoError && (
              <p className={styles.error} role="alert">
                {photoError}
              </p>
            )}
            <p className={styles.hint}>JPEG, PNG or WebP, up to 5 MB. It is resized and shown on the customer's menu card.</p>
          </section>

          <div className={styles.field}>
            <label htmlFor="pd-name" className={styles.label}>
              Name
            </label>
            <input
              id="pd-name"
              className={styles.input}
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Chicken fried rice"
              autoComplete="off"
            />
            {errors.name && <p className={styles.error}>{errors.name}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="pd-sku" className={styles.label}>
              SKU
            </label>
            <input
              id="pd-sku"
              className={styles.input}
              type="text"
              value={form.sku}
              onChange={(e) => setField('sku', e.target.value)}
              placeholder="e.g. MEAL-CHICKEN-FRIED-RICE"
              autoComplete="off"
            />
            {errors.sku && <p className={styles.error}>{errors.sku}</p>}
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="pd-category" className={styles.label}>
                Category
              </label>
              <select
                id="pd-category"
                className={styles.input}
                value={form.category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="pd-price" className={styles.label}>
                Selling price (USD)
              </label>
              <input
                id="pd-price"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={form.priceAmount}
                onChange={(e) => setField('priceAmount', e.target.value)}
                placeholder="0.00"
              />
              {errors.priceAmount && <p className={styles.error}>{errors.priceAmount}</p>}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="pd-typecode" className={styles.label}>
              Special meal code {typeCodeDisabled ? '(only for meals)' : ''}
            </label>
            <select
              id="pd-typecode"
              className={styles.input}
              value={form.typeCode}
              onChange={(e) => setField('typeCode', e.target.value as SpecialMealCode)}
              disabled={typeCodeDisabled}
            >
              {TYPE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.typeCode && <p className={styles.error}>{errors.typeCode}</p>}
          </div>

          <div className={styles.field}>
            <p className={styles.label}>Dietary attributes</p>
            <div className={styles.chips}>
              {DIETARY_OPTIONS.map((attr) => {
                const active = form.dietaryAttributes.includes(attr)
                return (
                  <button
                    key={attr}
                    type="button"
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    aria-pressed={active}
                    onClick={() => toggleDietary(attr)}
                  >
                    {attr.replace('_', ' ')}
                  </button>
                )
              })}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="pd-cost" className={styles.label}>
                Purchase cost (USD)
              </label>
              <input
                id="pd-cost"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={form.purchaseCostAmount}
                onChange={(e) => setField('purchaseCostAmount', e.target.value)}
                placeholder="Optional"
              />
              {errors.purchaseCostAmount && <p className={styles.error}>{errors.purchaseCostAmount}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="pd-shelf" className={styles.label}>
                Shelf life (days) {shelfLifeDisabled && <span className={styles.muted}>· disabled for duty-free</span>}
              </label>
              <input
                id="pd-shelf"
                className={styles.input}
                type="number"
                min="1"
                step="1"
                value={form.shelfLifeDays}
                onChange={(e) => setField('shelfLifeDays', e.target.value)}
                placeholder={shelfLifeDisabled ? 'Not applicable' : 'e.g. 2'}
                disabled={shelfLifeDisabled}
              />
              {errors.shelfLifeDays && <p className={styles.error}>{errors.shelfLifeDays}</p>}
            </div>
          </div>

          <label className={styles.switchRow}>
            <span className={styles.label}>Premium meal</span>
            <span className={styles.switchControl}>
              <input
                type="checkbox"
                checked={form.isPremium}
                onChange={(e) => setField('isPremium', e.target.checked)}
                className={styles.switchInput}
              />
              <span className={styles.switchTrack} aria-hidden="true">
                <span className={styles.switchThumb} />
              </span>
            </span>
          </label>

          <footer className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveButton} disabled={submitting}>
              {isEdit ? 'Save changes' : 'Add product'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
