import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { errorMessage, usePricingApi } from '../api'
import { useLoad } from '../hooks/useLoad'
import { CARD_BODY, CARD_TITLE, PRIMARY_BUTTON } from './charge-styles'
import { FormField } from './FormField'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'

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
    <Alert variant="destructive">
      <AlertDescription className="block">
        Could not load the pricing settings: {settings.error}{' '}
        <Button variant="link" className="h-auto p-0" type="button" onClick={settings.reload}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  ) : !settings.data ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Loading the pricing settings…</p>
  ) : (
    <form onSubmit={(e) => void save(e)} noValidate className="grid gap-3.5">
      <div className="grid max-w-[520px] grid-cols-2 items-start gap-3.5 max-[800px]:max-w-none max-[800px]:grid-cols-1">
        <FormField htmlFor="setting-base-currency" label="Base currency">
          <Input id="setting-base-currency" className="h-[42px] disabled:opacity-100" value={baseCurrency} disabled />
        </FormField>
        <FormField
          htmlFor="setting-quote-hold"
          label="Quote hold window (minutes)"
          error={invalid ? `A whole number from 1 to ${MAX_HOLD_MINUTES}` : undefined}
        >
          <Input
            id="setting-quote-hold"
            className="h-[42px]"
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
        </FormField>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="block">{error}</AlertDescription>
        </Alert>
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
    <Card aria-labelledby="settings-card-title">
      <CardHeader>
        <CardTitle id="settings-card-title" role="heading" aria-level={2} className={CARD_TITLE}>
          Pricing settings
        </CardTitle>
        <CardDescription>Every amount is stored in the base currency. Other currencies are display only.</CardDescription>
      </CardHeader>
      <CardContent className={CARD_BODY}>{body}</CardContent>
    </Card>
  )
}
