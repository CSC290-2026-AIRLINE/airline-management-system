import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { SegmentedControl } from '../components/SegmentedControl'
import { Callout } from '../components/Callout'
import { FormField } from '../components/FormField'
import { MockNotice } from '../components/MockNotice'
import { PageHeader } from '../components/PageHeader'
import { StaffShell } from '../components/StaffShell'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage } from '../hooks/usePagedList'
import { useResource } from '../hooks/useResource'
import '../flight-scheduling.css'

interface Saved {
  holding: string
  airline: string
  mode: string
  delay: string
}

interface ApiSettings {
  holding_limit_minutes: number | null
  airline_code: string | null
}

// ponytail: MOCK. Approval mode and response delay belong to the approval flow, which has no table (flight_setting only holds the two
// keys below); they start from the Figma values and live in memory. The holding limit and airline code are real.
const MOCK_APPROVAL = { mode: 'Manual', delay: '0' }

export function SettingsPage() {
  const { fetchWithAuth } = useAppAuth()
  const settings = useResource<ApiSettings>('/settings', fetchWithAuth)
  const loaded: Saved | null = settings.data && {
    holding: settings.data.holding_limit_minutes === null ? '' : String(settings.data.holding_limit_minutes),
    airline: settings.data.airline_code ?? '',
    ...MOCK_APPROVAL,
  }
  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Settings">
          Feature 2 keeps its own settings in the flight_setting table. Each value is checked for its key before it is saved.
        </PageHeader>
        <MockNotice>
          Approval mode and response delay are simulated until the approval flow exists. The other two settings are saved.
        </MockNotice>
        {settings.error && <p className="fs-error">{settings.error}</p>}
        {settings.loading && <p className="fs-sub">Loading settings…</p>}
        {loaded && <SettingsForm initial={loaded} />}
      </main>
    </StaffShell>
  )
}

function SettingsForm({ initial }: { initial: Saved }) {
  const { fetchWithAuth } = useAppAuth()
  const [saved, setSaved] = useState(initial)
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, say] = useNotice()

  const errors: string[] = []
  if (!/^\d+$/.test(form.holding) || Number(form.holding) < 1) errors.push('holding_limit_min must be a whole number of minutes')
  if (!/^[A-Za-z0-9]{2}$/.test(form.airline)) errors.push('airline_code must be two letters')
  if (!/^\d+$/.test(form.delay)) errors.push('approval_response_delay_min must be a whole number of minutes')
  const changed = JSON.stringify(form) !== JSON.stringify(saved)

  async function save() {
    setSaving(true)
    setFailure(null)
    try {
      const res = await fetchWithAuth(`${BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holding_limit_minutes: Number(form.holding), airline_code: form.airline }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      const next = { ...form, airline: form.airline.toUpperCase() }
      setSaved(next)
      setForm(next)
      say('Settings saved.')
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card first>
        <h2>Operations</h2>
        <div className="fs-setting">
          <FormField label="Holding limit (minutes)" value={form.holding} onChange={(e) => setForm({ ...form, holding: e.target.value })} />
          <p className="fs-sub">Past this many minutes in a hold, the system proposes a diversion.</p>
        </div>
        <div className="fs-setting">
          <FormField
            label="Airline code"
            value={form.airline}
            maxLength={2}
            onChange={(e) => setForm({ ...form, airline: e.target.value })}
          />
          <p className="fs-sub">Two letters. Starts every flight number, for example {form.airline.toUpperCase() || 'XX'}101.</p>
        </div>
      </Card>

      <Card>
        <h2>Schedule approval</h2>
        <div className="fs-setting">
          <div>
            <p className="fs-field-label fs-flush">Approval mode</p>
            <SegmentedControl options={['Auto', 'Manual']} value={form.mode} onChange={(m) => setForm({ ...form, mode: m })} />
          </div>
          <p className="fs-sub">
            Auto: the system answers by each airport's approval policy. Manual: requests wait on the Approver console until a team member
            answers.
          </p>
        </div>
        <div className="fs-setting">
          <FormField label="Response delay (minutes)" value={form.delay} onChange={(e) => setForm({ ...form, delay: e.target.value })} />
          <p className="fs-sub">How long the automatic approver waits on the simulation clock before it answers. 0 answers at once.</p>
        </div>
      </Card>

      {failure && (
        <Callout tone="crit">
          <b>Not saved.</b> {failure}
        </Callout>
      )}
      {changed && errors.length > 0 && (
        <Callout tone="crit">
          <b>422 Invalid value.</b> {errors.join('; ')}.
        </Callout>
      )}
      <div className="fs-form-actions">
        <button type="button" className="fs-button" disabled={errors.length > 0 || saving} onClick={() => void save()}>
          Save settings
        </button>
        <button type="button" className="fs-button-ghost" onClick={() => setForm(saved)}>
          Discard changes
        </button>
      </div>
      <Toast message={notice} />
    </>
  )
}
