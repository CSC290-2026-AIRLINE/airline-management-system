// Small inline add-product dialog used from the Receive delivery page.
// Lets the user create a one-off product without leaving the page, so
// the new line can be added to the same delivery.

/* eslint-disable react-hooks/set-state-in-effect -- reset validation error as the form changes */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useDialogFocusTrap } from '../catalog/useDialogFocusTrap'
import { createProduct, ProductApiError } from '../api/products'
import { addDays } from '../mocks/clock'
import type { Product, ProductCategory, ProductInput } from '../api/types'
import styles from './AddProductDialog.module.css'

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
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const headingId = useId()
  useDialogFocusTrap(true, dialogRef, onClose)
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
      const created = await createProduct(input)
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
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && !submitting && onClose()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className={styles.header}>
          <h2 id={headingId} className={styles.title}>
            Add a new product
          </h2>
          <p className={styles.subtitle}>
            Add a one-off item to the catalog so you can receive it on this delivery. You can edit it later under Product Catalog.
          </p>
        </header>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="apd-name" className={styles.label}>
              Name
            </label>
            <input
              id="apd-name"
              className={styles.input}
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Chicken fried rice"
              autoComplete="off"
              autoFocus
              disabled={submitting}
            />
            {errors.name && <p className={styles.error}>{errors.name}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="apd-category" className={styles.label}>
              Category
            </label>
            <select
              id="apd-category"
              className={styles.input}
              value={form.category}
              onChange={(e) => setCategory(e.target.value as CategoryChoice)}
              disabled={submitting}
            >
              <option value="meal">Meals</option>
              <option value="snacks_drinks">Snacks & drinks</option>
              <option value="duty_free">Duty-free</option>
            </select>
            <p className={styles.hint}>
              {form.category === 'meal' && 'Expiry defaults to 2 days after receipt.'}
              {form.category === 'snacks_drinks' && 'Expiry defaults to 180 days after receipt.'}
              {form.category === 'duty_free' && 'Duty-free items do not expire.'}
            </p>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="apd-cost" className={styles.label}>
                Unit cost (USD)
              </label>
              <input
                id="apd-cost"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={form.unitCost}
                onChange={(e) => setField('unitCost', e.target.value)}
                placeholder="0.00"
                disabled={submitting}
              />
              {errors.unitCost && <p className={styles.error}>{errors.unitCost}</p>}
            </div>
            <div className={styles.field}>
              <label htmlFor="apd-price" className={styles.label}>
                Selling price (USD)
              </label>
              <input
                id="apd-price"
                className={styles.input}
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) => setField('sellingPrice', e.target.value)}
                placeholder="0.00"
                disabled={submitting}
              />
              {errors.sellingPrice && <p className={styles.error}>{errors.sellingPrice}</p>}
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="apd-expiry" className={styles.label}>
              Expiry {expiresDisabled && <span className={styles.muted}>· not applicable for duty-free</span>}
            </label>
            <input
              id="apd-expiry"
              className={styles.input}
              type="date"
              value={form.expiresAt}
              onChange={(e) => setField('expiresAt', e.target.value)}
              disabled={expiresDisabled || submitting}
            />
            {form.expiresAt !== '' && <p className={styles.hint}>{daysFromNowFn(form.expiresAt)} days after today</p>}
          </div>

          <footer className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={styles.saveButton} disabled={submitting}>
              {submitting ? 'Saving…' : 'Add product'}
            </button>
          </footer>
        </form>
      </div>
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
