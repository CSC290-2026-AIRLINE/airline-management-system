import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { AirportTabs } from '../components/AirportTabs'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import type { AirportFeeRow, AirportRow } from '../types'
import '../flight-scheduling.css'

const EMPTY = { fee: 'landing', appliesOn: 'arrival', amount: '', unit: 'per_flight', currency: 'THB', from: '', to: '' }
const UNITS = ['per_flight', 'per_hour', 'per_tonne']
const unitLabel = (unit: string) => unit.replace('_', ' ')

export function AirportFeesPage() {
  const { fetchWithAuth } = useAppAuth()
  const airports = usePagedList<AirportRow>('/airports?is_active=true&limit=100', fetchWithAuth)
  const [code, setCode] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState<AirportFeeRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  const airport = code || airports.rows[0]?.iata_code || ''
  const fees = usePagedList<AirportFeeRow>(`/airport-fees?airport=${airport || 'XXX'}`, fetchWithAuth)

  function edit(f: AirportFeeRow) {
    setEditing(f)
    setError(null)
    setForm({
      fee: f.fee_type,
      appliesOn: f.applies_on,
      amount: String(f.amount),
      unit: f.unit,
      currency: f.currency,
      from: f.effective_from,
      to: f.effective_to ?? '',
    })
  }

  function cancel() {
    setEditing(null)
    setError(null)
    setForm(EMPTY)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithAuth(`${BASE}/airport-fees${editing ? `/${editing.id}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          airport,
          fee_type: form.fee,
          applies_on: form.appliesOn,
          amount: form.amount === '' ? null : Number(form.amount),
          unit: form.unit,
          currency: form.currency,
          effective_from: form.from,
          effective_to: form.to || null,
        }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      say(`${form.fee} fee ${editing ? 'updated' : 'added'} for ${airport}.`)
      cancel()
      fees.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Airports">
          Master data for every airport we fly to. The minimum turnaround feeds the position and turnaround check, the fees feed the cost
          estimate, and the approval policy drives the simulated approver.
        </PageHeader>
        <AirportTabs />

        <Card first>
          <h2>Airport fees</h2>
          <p className="fs-sub">
            Charges an airport makes the airline. A landing fee is incurred on arrival, a handling or navigation fee on departure. The fee
            in force on the flight's local date is used by the cost estimate on Flight detail.
          </p>
          <div className="fs-reason fs-mt">
            <SelectField label="Airport" value={airport} onChange={(e) => setCode(e.target.value)}>
              {airports.rows.map((a) => (
                <option key={a.iata_code} value={a.iata_code}>
                  {a.iata_code} · {a.city}
                </option>
              ))}
            </SelectField>
          </div>

          <ListState
            loading={fees.loading}
            error={fees.error}
            empty={fees.rows.length === 0}
            noun="fees"
            emptyText={`No fees recorded for ${airport || 'this airport'}.`}
          />
          {fees.rows.length > 0 && (
            <TableWrap>
              <table className="fs-table fs-t-fees">
                <thead>
                  <tr>
                    <th>Fee</th>
                    <th>Applies on</th>
                    <th>Amount</th>
                    <th>Unit</th>
                    <th>Effective</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {fees.rows.map((f) => (
                    <tr key={f.id} className={editing?.id === f.id ? 'fs-row-on' : undefined}>
                      <td>{f.fee_type}</td>
                      <td>{f.applies_on}</td>
                      <td>
                        {f.amount.toLocaleString('en-US')} {f.currency}
                      </td>
                      <td>{unitLabel(f.unit)}</td>
                      <td>
                        {f.effective_from} to {f.effective_to ?? 'open'}
                      </td>
                      <td>
                        <button type="button" className="fs-button-light" onClick={() => edit(f)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}

          <form onSubmit={(e) => void save(e)}>
            <h3 className="fs-section-title">{editing ? `Edit ${editing.fee_type} fee` : `Add a fee for ${airport}`}</h3>
            <div className="fs-form-grid fs-form-fee">
              <SelectField label="Fee type" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })}>
                {['landing', 'parking', 'handling', 'navigation'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </SelectField>
              <SelectField label="Applies on" value={form.appliesOn} onChange={(e) => setForm({ ...form, appliesOn: e.target.value })}>
                <option>arrival</option>
                <option>departure</option>
              </SelectField>
              <FormField
                label="Amount"
                half
                type="number"
                min={0}
                value={form.amount}
                placeholder="6500"
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <SelectField label="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </SelectField>
              <SelectField half label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option>THB</option>
              </SelectField>
              <FormField
                label="Effective from"
                half
                type="date"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
              <FormField
                label="Effective to (optional)"
                half
                type="date"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
            </div>
            <p className="fs-sub">
              409 if the dates overlap another fee of the same type and movement at this airport; 422 if the amount is negative.
            </p>
            {error && (
              <p className="fs-error" role="alert">
                {error}
              </p>
            )}
            <div className="fs-form-actions">
              <button type="submit" className="fs-button" disabled={!airport || busy}>
                {editing ? 'Save changes' : 'Add fee'}
              </button>
              {editing && (
                <button type="button" className="fs-button-ghost" onClick={cancel}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
