import { useState, type FormEvent } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { DateField } from '../components/DateField'
import { ListState } from '../components/ListState'
import { SelectField } from '../components/SelectField'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import type { AirportFeeRow, AirportRow } from '../types'
import '../flight-scheduling.css'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@staff-web/components/ui/table'

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
  const fees = usePagedList<AirportFeeRow>(airport ? `/airports/${airport}/fees` : null, fetchWithAuth)

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
      const res = await fetchWithAuth(editing ? `${BASE}/airport-fees/${editing.id}` : `${BASE}/airports/${airport}/fees`, {
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
    <>
      <Card first>
        <h2>Airport fees</h2>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee</TableHead>
                  <TableHead>Applies on</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.rows.map((f) => (
                  <TableRow key={f.id} className={editing?.id === f.id ? 'fs-row-on' : undefined}>
                    <TableCell>{f.fee_type}</TableCell>
                    <TableCell>{f.applies_on}</TableCell>
                    <TableCell>
                      {f.amount.toLocaleString('en-US')} {f.currency}
                    </TableCell>
                    <TableCell>{unitLabel(f.unit)}</TableCell>
                    <TableCell>
                      {f.effective_from} to {f.effective_to ?? 'open'}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" type="button" onClick={() => edit(f)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <DateField
              label="Effective from"

              value={form.from}
              onChange={(value) => setForm({ ...form, from: value })}
            />
            <DateField
              label="Effective to (optional)"

              value={form.to}
              onChange={(value) => setForm({ ...form, to: value })}
            />
          </div>
          {error && (
            <p className="fs-error" role="alert">
              {error}
            </p>
          )}
          <div className="fs-form-actions">
            <Button type="submit" disabled={!airport || busy}>
              {editing ? 'Save changes' : 'Add fee'}
            </Button>
            {editing && (
              <Button variant="ghost" type="button" onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>
      <Toast message={notice} />
    </>
  )
}
