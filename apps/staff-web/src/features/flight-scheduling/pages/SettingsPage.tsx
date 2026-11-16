import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Button } from '@staff-web/components/ui/button'
import { Label } from '@staff-web/components/ui/label'
import { Callout } from '../components/Callout'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { SegmentedControl } from '../components/SegmentedControl'
import { Toast } from '../components/Toast'
import { emitChange } from '../hooks/fsChange'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import '../flight-scheduling.css'

interface Saved {
  holding: string
  airline: string
  mode: 'auto' | 'manual'
  delay: string
}

interface ApiSettings {
  holding_limit_minutes: number | null
  airline_code: string | null
  approval_mode: 'auto' | 'manual'
  approval_response_delay_minutes: number
}

export function SettingsPage() {
  const { fetchWithAuth } = useAppAuth()
  const settings = useResource<ApiSettings>('/flight-settings', fetchWithAuth)
  const loaded: Saved | null = settings.data && {
    holding: settings.data.holding_limit_minutes === null ? '' : String(settings.data.holding_limit_minutes),
    airline: settings.data.airline_code ?? '',
    mode: settings.data.approval_mode,
    delay: String(settings.data.approval_response_delay_minutes),
  }
  return (
    <>
      <ListState loading={settings.loading} error={settings.error} empty={false} noun="settings" emptyText="" />
      {loaded && <SettingsForm initial={loaded} />}
    </>
  )
}

// The message under a field, or undefined when the value is fine.
function problems(form: Saved) {
  return {
    holding: /^\d+$/.test(form.holding) && Number(form.holding) >= 1 ? undefined : 'Enter a whole number of minutes, 1 or more',
    airline: /^[A-Za-z0-9]{2}$/.test(form.airline) ? undefined : 'Use exactly two letters or digits',
    delay: /^\d+$/.test(form.delay) ? undefined : 'Enter a whole number of minutes, 0 or more',
  }
}

function SettingsForm({ initial }: { initial: Saved }) {
  const { fetchWithAuth } = useAppAuth()
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [notice, say] = useNotice()

  const found = problems(form)
  const invalid = Object.values(found).some(Boolean)
  const changed = JSON.stringify(form) !== JSON.stringify(saved)
  // A message shows once the field has been left, so typing the first digit is not an error.
  const shown = (key: keyof typeof found) => (touched.has(key) ? found[key] : undefined)
  const touch = (key: string) => setTouched((t) => new Set(t).add(key))

  async function save() {
    setTouched(new Set(['holding', 'airline', 'delay']))
    if (invalid) return
    setSaving(true)
    setFailure(null)
    try {
      const res = await fetchWithAuth(`${BASE}/flight-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_limit_minutes: Number(form.holding),
          airline_code: form.airline,
          approval_mode: form.mode,
          approval_response_delay_minutes: Number(form.delay),
        }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      const next = { ...form, airline: form.airline.toUpperCase() }
      setSaved(next)
      setForm(next)
      setTouched(new Set())
      emitChange('settings')
      say('Settings saved.')
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    setForm(saved)
    setTouched(new Set())
    setFailure(null)
  }

  return (
    <div className="grid max-w-2xl gap-6">
      <Card first>
        <h2>Operations</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Holding limit"
            suffix="min"
            inputMode="numeric"
            value={form.holding}
            error={shown('holding')}
            onBlur={() => touch('holding')}
            onChange={(e) => setForm({ ...form, holding: e.target.value })}
          />
          <FormField
            label="Airline code"
            maxLength={2}
            autoCapitalize="characters"
            className="uppercase"
            value={form.airline}
            error={shown('airline')}
            onBlur={() => touch('airline')}
            onChange={(e) => setForm({ ...form, airline: e.target.value.toUpperCase() })}
          />
        </div>
      </Card>

      <Card first>
        <h2>Schedule approval</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-start gap-1.5">
            <Label id="approval-mode">Approval mode</Label>
            <SegmentedControl
              options={['auto', 'manual'] as const}
              labels={{ auto: 'Auto', manual: 'Manual' }}
              value={form.mode}
              onChange={(mode) => setForm({ ...form, mode })}
            />
          </div>
          {/* The delay is how long the automatic approver waits, so it does nothing in manual mode. */}
          <FormField
            label="Response delay"
            suffix="min"
            inputMode="numeric"
            disabled={form.mode === 'manual'}
            value={form.delay}
            error={form.mode === 'manual' ? undefined : shown('delay')}
            onBlur={() => touch('delay')}
            onChange={(e) => setForm({ ...form, delay: e.target.value })}
          />
        </div>
      </Card>

      {failure && (
        <Callout tone="crit">
          <b>Not saved.</b> {failure}
        </Callout>
      )}

      {changed && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
          <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button variant="ghost" type="button" onClick={discard}>
              Discard
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </div>
      )}
      <Toast message={notice} />
    </div>
  )
}
