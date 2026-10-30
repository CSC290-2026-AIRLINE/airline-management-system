import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { errorMessage, usePricingApi } from '../api'
import { useLoad } from '../hooks/useLoad'
import { useCurrencyRateApi, type CurrencyRate } from './currency-api'

const NOTICE_MS = 3000
const CODE_PATTERN = /^[A-Z]{3}$/
const AMOUNT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const RATE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6, useGrouping: false })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// Shared look for the pricing pages: colours come from the --pr-* tokens on PricingShell.
const fieldClass =
  'h-10 rounded-(--pr-radius-field) border-(--pr-border) bg-white text-(length:--pr-text-label) focus-visible:ring-(--pr-primary)/20'
const primaryClass = 'h-10 rounded-(--pr-radius-lg) bg-(--pr-primary) px-5 text-white hover:bg-(--pr-primary-hover)'

// Display-only rates (design: Taxes, currency & promos → Currency rates). Shown amount = base amount × rate.
export function CurrencyRatesCard() {
  const api = useCurrencyRateApi()
  const pricingApi = usePricingApi()
  const rates = useLoad(() => api.list(), 'currency-rates')
  const base = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  // Typed values by currency code; a code is only here once staff edit its box.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const list = rates.data ?? []
  const unit = base.data ?? ''
  const changed = list.filter((rate) => rate.currency_code in drafts && Number(drafts[rate.currency_code]) !== Number(rate.rate_per_base))
  const invalid = changed.find((rate) => !isPositive(drafts[rate.currency_code]))

  function draftOf(rate: CurrencyRate) {
    return drafts[rate.currency_code] ?? RATE.format(Number(rate.rate_per_base))
  }

  async function saveRates() {
    if (invalid) {
      setError(`${invalid.currency_code}: the rate must be a number greater than 0`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      // One PATCH per changed row; the backend has no bulk endpoint.
      for (const rate of changed) {
        await api.update(rate.currency_code, Number(drafts[rate.currency_code]))
      }
      setDrafts({})
      setNotice(changed.length === 1 ? 'Rate saved' : `${changed.length} rates saved`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
      rates.reload()
    }
  }

  const body = rates.error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load currency rates: {rates.error}{' '}
      <button type="button" className="pr-link-button" onClick={rates.reload}>
        Retry
      </button>
    </div>
  ) : !rates.data || !base.data ? (
    <p className="pr-state">Loading currency rates…</p>
  ) : list.length === 0 ? (
    <p className="pr-state">No currency rates yet. Add one below.</p>
  ) : (
    <>
      {/* Desktop: one table */}
      <div className="overflow-hidden rounded-(--pr-radius-lg) border border-(--pr-border) max-[800px]:hidden">
        <Table className="text-(length:--pr-text-body)">
          <TableHeader className="bg-(--pr-head)">
            <TableRow className="border-(--pr-border) hover:bg-transparent">
              <TableHead className={headClass}>Currency</TableHead>
              <TableHead className={headClass}>Per 1 {unit}</TableHead>
              <TableHead className={headClass}>Example</TableHead>
              <TableHead className={headClass}>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((rate) => (
              <TableRow key={rate.currency_code} className="border-(--pr-divider) hover:bg-transparent">
                <TableCell className="px-4 py-2.5 font-semibold text-(--pr-ink)">{rate.currency_code}</TableCell>
                <TableCell className="px-4 py-2.5">{rateInput(rate, 'w-28')}</TableCell>
                <TableCell className="px-4 py-2.5">{example(rate)}</TableCell>
                <TableCell className="px-4 py-2.5">{updated(rate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone: one card per currency */}
      <ul className="grid gap-2.5 min-[801px]:hidden">
        {list.map((rate) => (
          <li key={rate.currency_code} className="grid gap-1.5 rounded-(--pr-radius-card) border border-(--pr-divider) p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-(length:--pr-text-label) text-(--pr-ink)">{rate.currency_code}</strong>
              <span className="text-(length:--pr-text-small) text-(--pr-muted)">Updated {DAY.format(new Date(rate.updated_at))}</span>
            </div>
            <span className="text-(length:--pr-text-caption) font-semibold tracking-wide text-(--pr-muted) uppercase">Per 1 {unit}</span>
            {rateInput(rate, 'w-full')}
            <span className="text-(length:--pr-text-small) text-(--pr-muted)">{example(rate)}</span>
          </li>
        ))}
      </ul>
    </>
  )

  function rateInput(rate: CurrencyRate, width: string) {
    const value = draftOf(rate)
    return (
      <Input
        inputMode="decimal"
        aria-label={`${rate.currency_code} per 1 ${unit}`}
        aria-invalid={!isPositive(value) || undefined}
        className={`${fieldClass} ${width} text-right max-[800px]:text-left`}
        value={value}
        disabled={saving}
        onChange={(e) => setDrafts({ ...drafts, [rate.currency_code]: e.target.value })}
      />
    )
  }

  function example(rate: CurrencyRate) {
    const value = Number(draftOf(rate))
    const shown = isPositive(draftOf(rate)) ? AMOUNT.format(100 * value) : '—'
    return `100.00 ${unit} → ${shown} ${rate.currency_code}`
  }

  return (
    <section className="pr-card" aria-labelledby="currency-card-title">
      <div className="pr-card-head">
        <h2 id="currency-card-title" className="pr-card-title">
          Currency rates (display only)
        </h2>
        <p className="pr-muted">Typed in by hand. Shown amount = base amount × rate. Never used for charging or storage.</p>
      </div>

      {body}

      {error && (
        <div className="pr-callout is-error" role="alert">
          {error}
        </div>
      )}

      {rates.data && list.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 max-[800px]:grid">
          <Button className={primaryClass} disabled={saving || changed.length === 0} onClick={() => void saveRates()}>
            {saving ? 'Saving…' : 'Save rates'}
          </Button>
          <p role="status" aria-live="polite" className="m-0 text-(length:--pr-text-body) font-semibold text-(--pr-good) empty:hidden">
            {notice}
          </p>
        </div>
      )}

      {rates.data && base.data && (
        <AddCurrencyForm
          base={unit}
          disabled={saving}
          onAdded={(code) => {
            setNotice(`${code} added`)
            rates.reload()
          }}
        />
      )}
    </section>
  )
}

const headClass = 'h-10 px-4 text-(length:--pr-text-caption) font-semibold tracking-wide text-(--pr-text) uppercase'

function updated(rate: CurrencyRate) {
  return (
    <div className="grid">
      <span>{DAY.format(new Date(rate.updated_at))}</span>
      <span className="text-(length:--pr-text-small) text-(--pr-muted)">
        by {rate.staff.first_name} {rate.staff.last_name}
      </span>
    </div>
  )
}

function isPositive(value: string) {
  return value.trim() !== '' && Number(value) > 0
}

interface AddCurrencyFormProps {
  base: string
  disabled: boolean
  onAdded: (code: string) => void
}

// Not in the design, but the guide (Step 1) lets staff add a currency.
function AddCurrencyForm({ base, disabled, onAdded }: AddCurrencyFormProps) {
  const api = useCurrencyRateApi()
  const [code, setCode] = useState('')
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!CODE_PATTERN.test(code)) {
      setError('Currency code must be 3 capital letters, e.g. USD')
      return
    }
    if (code === base) {
      setError(`${base} is the base currency; its rate is always 1`)
      return
    }
    if (!isPositive(rate)) {
      setError('The rate must be a number greater than 0')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.create(code, Number(rate))
      setCode('')
      setRate('')
      onAdded(code)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-2 border-t border-(--pr-divider) pt-3.5" onSubmit={(e) => void submit(e)}>
      <span className="text-(length:--pr-text-caption) font-semibold tracking-wide text-(--pr-muted) uppercase">Add a currency</span>
      <div className="flex flex-wrap items-end gap-2.5 max-[800px]:grid max-[800px]:grid-cols-2">
        <Input
          aria-label="New currency code"
          placeholder="Code, e.g. GBP"
          maxLength={3}
          className={`${fieldClass} w-36 uppercase max-[800px]:w-full`}
          value={code}
          disabled={disabled || busy}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Input
          aria-label={`New rate per 1 ${base}`}
          placeholder={`Per 1 ${base}`}
          inputMode="decimal"
          className={`${fieldClass} w-36 max-[800px]:w-full`}
          value={rate}
          disabled={disabled || busy}
          onChange={(e) => setRate(e.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          className="h-10 rounded-(--pr-radius-lg) border-(--pr-primary) px-5 text-(--pr-primary) max-[800px]:col-span-2"
          disabled={disabled || busy}
        >
          {busy ? 'Adding…' : '+ Add currency'}
        </Button>
      </div>
      {error && (
        <div className="pr-callout is-error" role="alert">
          {error}
        </div>
      )}
    </form>
  )
}
