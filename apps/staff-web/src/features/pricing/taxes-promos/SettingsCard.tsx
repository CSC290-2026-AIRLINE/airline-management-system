import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { errorMessage, usePricingApi } from '../api'
import { useLoad } from '../hooks/useLoad'
import { PRIMARY_BUTTON } from './charge-styles'

const NOTICE_MS = 3000
const MAX_HOLD_MINUTES = 1440 // MAX_QUOTE_HOLD_MINUTES in the backend's pricing.constants.ts
const WHOLE_NUMBER = /^[1-9]\d*$/

// Design: Taxes, currency & promos → Pricing settings. The base currency is set by the seed, so it is shown but not editable.
export function SettingsCard() {
  const api = usePricingApi()
  const settings = useLoad(() => api.listSettings(), 'settings')
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const baseCurrency = settings.data?.find((setting) => setting.key === 'base_currency')?.value ?? ''
  const savedHold = settings.data?.find((setting) => setting.key === 'quote_hold_minutes')?.value ?? ''
  const hold = draft ?? savedHold

  async function save(event: FormEvent) {
    event.preventDefault()
    const value = hold.trim()
    if (!WHOLE_NUMBER.test(value) || Number(value) > MAX_HOLD_MINUTES) {
      setInvalid(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.updateSetting('quote_hold_minutes', value)
      setNotice('Settings saved')
      settings.reload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const body = settings.error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load the pricing settings: {settings.error}{' '}
      <button type="button" className="pr-link-button" onClick={settings.reload}>
        Retry
      </button>
    </div>
  ) : !settings.data ? (
    <p className="pr-state">Loading the pricing settings…</p>
  ) : (
    <form onSubmit={(e) => void save(e)} noValidate className="grid gap-3.5">
      <div className="grid max-w-[520px] grid-cols-2 items-start gap-3.5 max-[800px]:max-w-none max-[800px]:grid-cols-1">
        <div className="pr-field">
          <label htmlFor="setting-base-currency">Base currency</label>
          <Input id="setting-base-currency" className="disabled:opacity-100" value={baseCurrency} disabled />
        </div>
        <div className="pr-field">
          <label htmlFor="setting-quote-hold">Quote hold window (minutes)</label>
          <Input
            id="setting-quote-hold"
            inputMode="numeric"
            value={hold}
            disabled={saving}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'setting-quote-hold-error' : undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              setInvalid(false)
              setNotice(null)
            }}
          />
          {invalid && (
            <span id="setting-quote-hold-error" className="pr-field-error">
              A whole number from 1 to {MAX_HOLD_MINUTES}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="pr-callout is-error" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 max-[800px]:grid">
        <Button type="submit" className={PRIMARY_BUTTON} disabled={saving || hold.trim() === savedHold}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
        <p role="status" aria-live="polite" className="m-0 text-(length:--pr-text-body) font-semibold text-(--pr-good) empty:hidden">
          {notice}
        </p>
      </div>
    </form>
  )

  return (
    <section className="pr-card" aria-labelledby="settings-card-title">
      <div className="pr-card-head">
        <h2 id="settings-card-title" className="pr-card-title">
          Pricing settings
        </h2>
        <p className="pr-muted">Every amount is stored in the base currency. Other currencies are display only.</p>
      </div>

      {body}
    </section>
  )
}
