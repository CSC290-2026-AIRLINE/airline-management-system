import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { useEffect, useState } from 'react'
import { AirportTabs } from '../components/AirportTabs'
import { Card } from '../components/Card'
import { FormField } from '../components/FormField'
import { ListState } from '../components/ListState'
import { NotConnected } from '../components/NotConnected'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { TableWrap } from '../components/TableWrap'
import { Toast } from '../components/Toast'
import { CONNECTED } from '../connected'
import { useNotice } from '../hooks/useNotice'
import { BASE, errorMessage, usePagedList } from '../hooks/usePagedList'
import type { AirportRow, ApprovalPolicy } from '../types'
import '../flight-scheduling.css'

// The form keeps every field as text; an empty curfew time or cap means "none".
interface Draft {
  airport: string
  curfewFrom: string
  curfewTo: string
  maxPerHour: string
  offerStyle: ApprovalPolicy['offer_style']
}

const toDraft = (p: ApprovalPolicy): Draft => ({
  airport: p.airport,
  curfewFrom: p.curfew_start_local ?? '',
  curfewTo: p.curfew_end_local ?? '',
  maxPerHour: p.max_departure_per_hour === null ? '' : String(p.max_departure_per_hour),
  offerStyle: p.offer_style,
})

// What is wrong with a draft, or null when it can be saved. The backend checks the same rules.
function problem(d: Draft) {
  if ((d.curfewFrom === '') !== (d.curfewTo === '')) return 'Set both curfew times, or clear both.'
  if (d.curfewFrom !== '' && d.curfewFrom === d.curfewTo) return 'The curfew start and end must differ.'
  if (d.maxPerHour !== '' && !(Number.isInteger(Number(d.maxPerHour)) && Number(d.maxPerHour) >= 1))
    return 'Max departures per hour must be a whole number from 1.'
  return null
}

// The rules the simulated approver follows, one per airport, from GET /airports/:iata/approval-policy. An airport that was never set reads
// as no curfew and no cap. Saving is PUT on the same path.
export function ApprovalPolicyPage() {
  const { fetchWithAuth } = useAppAuth()
  const airports = usePagedList<AirportRow>('/airports?is_active=true&limit=100', fetchWithAuth)
  const [policies, setPolicies] = useState<ApprovalPolicy[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  const codes = airports.rows.map((a) => a.iata_code).join(',')
  useEffect(() => {
    if (!CONNECTED.approvalPolicy || codes === '') return
    let stale = false
    Promise.all(
      codes.split(',').map(async (code) => {
        const res = await fetchWithAuth(`${BASE}/airports/${code}/approval-policy`)
        if (!res.ok) throw new Error(await errorMessage(res))
        return (await res.json()) as ApprovalPolicy
      }),
    )
      .then((rows) => !stale && (setPolicies(rows), setError(null)))
      .catch((e: unknown) => !stale && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      stale = true
    }
    // fetchWithAuth changes with the token; the policies only need to load again when the airports or `version` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes, version])

  async function save() {
    if (!editing || problem(editing)) return
    setBusy(true)
    try {
      const res = await fetchWithAuth(`${BASE}/airports/${editing.airport}/approval-policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curfew_start_local: editing.curfewFrom || null,
          curfew_end_local: editing.curfewTo || null,
          max_departure_per_hour: editing.maxPerHour === '' ? null : Number(editing.maxPerHour),
          offer_style: editing.offerStyle,
        }),
      })
      if (!res.ok) throw new Error(await errorMessage(res))
      say(`Approval policy for ${editing.airport} saved.`)
      setEditing(null)
      setVersion((v) => v + 1)
    } catch (e) {
      say(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const rows = policies ?? []
  const wrong = editing ? problem(editing) : null

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Airports">
          Master data for every airport we fly to. The minimum turnaround feeds the position and turnaround check, the fees feed the cost
          estimate, and the approval policy drives the simulated approver.
        </PageHeader>
        <AirportTabs />
        {!CONNECTED.approvalPolicy && <NotConnected>Approval policies are hidden until their API is connected.</NotConnected>}

        {CONNECTED.approvalPolicy && (
          <Card first>
            <h2>Approval policy</h2>
            <p className="fs-sub">
              The rules the simulated approver (the origin airport's slot coordinator) follows in automatic mode. Times are local at the
              airport. Staff edit them without a code change.
            </p>
            <ListState
              loading={airports.loading || (policies === null && error === null)}
              error={airports.error ?? error}
              empty={rows.length === 0}
              noun="approval policies"
              emptyText="No airports yet."
            />
            {rows.length > 0 && (
              <TableWrap spaced>
                <table className="fs-table fs-t-policy">
                  <thead>
                    <tr>
                      <th>Airport</th>
                      <th data-short="Curfew">Curfew (local)</th>
                      <th data-short="Max dep / hour">Max departures per hour</th>
                      <th data-short="Offers">Offers other times as</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.airport} className={editing?.airport === p.airport ? 'fs-row-on' : undefined}>
                        <td className="fs-flight">{p.airport}</td>
                        <td className={p.curfew_start_local ? undefined : 'fs-to'}>
                          {p.curfew_start_local ? `${p.curfew_start_local} to ${p.curfew_end_local}` : 'No curfew'}
                        </td>
                        <td>{p.max_departure_per_hour ?? 'No limit'}</td>
                        <td>{p.offer_style === 'slots' ? 'A list of slots' : 'A time window'}</td>
                        <td>
                          <button type="button" className="fs-button-light" onClick={() => setEditing(toDraft(p))}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}

            {editing && (
              <div>
                <h3 className="fs-section-title">Edit policy for {editing.airport}</h3>
                <div className="fs-form-grid">
                  <FormField
                    label="Curfew from (empty for none)"
                    type="time"
                    value={editing.curfewFrom}
                    onChange={(e) => setEditing({ ...editing, curfewFrom: e.target.value })}
                  />
                  <FormField
                    label="Curfew to (empty for none)"
                    type="time"
                    value={editing.curfewTo}
                    onChange={(e) => setEditing({ ...editing, curfewTo: e.target.value })}
                  />
                  <FormField
                    label="Max departures per hour (empty for no limit)"
                    type="number"
                    min={1}
                    value={editing.maxPerHour}
                    onChange={(e) => setEditing({ ...editing, maxPerHour: e.target.value })}
                  />
                  <SelectField
                    label="Offers other times as"
                    value={editing.offerStyle}
                    onChange={(e) => setEditing({ ...editing, offerStyle: e.target.value as Draft['offerStyle'] })}
                  >
                    <option value="slots">A list of slots</option>
                    <option value="window">A time window</option>
                  </SelectField>
                </div>
                {wrong && <p role="alert">{wrong}</p>}
                <div className="fs-form-actions">
                  <button type="button" className="fs-button" disabled={busy || wrong !== null} onClick={() => void save()}>
                    Save policy
                  </button>
                  <button type="button" className="fs-button-ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
