import { useState } from 'react'
import { AirportTabs } from '../components/AirportTabs'
import { TableWrap } from '../components/TableWrap'
import { FormField } from '../components/FormField'
import { MockNotice } from '../components/MockNotice'
import { PageHeader } from '../components/PageHeader'
import { SelectField } from '../components/SelectField'
import { StaffShell } from '../components/StaffShell'
import { Toast } from '../components/Toast'
import { Card } from '../components/Card'
import { useNotice } from '../hooks/useNotice'
import { MOCK_POLICIES, type MockPolicy } from '../mocks/network-ops'
import '../flight-scheduling.css'

// ponytail: MOCK. Approval policies have no table or API yet (spec v2): these are the Figma samples and edits live in memory only.
export function ApprovalPolicyPage() {
  const [policies, setPolicies] = useState<MockPolicy[]>(MOCK_POLICIES)
  const [editing, setEditing] = useState<MockPolicy | null>(null)
  const [notice, say] = useNotice()

  function save() {
    if (!editing) return
    setPolicies(policies.map((p) => (p.airport === editing.airport ? editing : p)))
    say(`Approval policy for ${editing.airport} saved.`)
    setEditing(null)
  }

  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title="Airports">
          Master data for every airport we fly to. The minimum turnaround feeds the position and turnaround check, the fees feed the cost
          estimate, and the approval policy drives the simulated approver.
        </PageHeader>
        <AirportTabs />
        <MockNotice>The policies are simulated until the policy table exists.</MockNotice>

        <Card first>
          <h2>Approval policy</h2>
          <p className="fs-sub">
            The rules the simulated approver (the origin airport's slot coordinator) follows in automatic mode. Times are local at the
            airport. Staff edit them without a code change.
          </p>
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
                {policies.map((p) => (
                  <tr key={p.airport} className={editing?.airport === p.airport ? 'fs-row-on' : undefined}>
                    <td className="fs-flight">{p.airport}</td>
                    <td className={p.curfewFrom ? undefined : 'fs-to'}>
                      {p.curfewFrom ? `${p.curfewFrom} to ${p.curfewTo}` : 'No curfew'}
                    </td>
                    <td>{p.maxPerHour}</td>
                    <td>{p.offers}</td>
                    <td>
                      <button type="button" className="fs-button-light" onClick={() => setEditing(p)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>

          {editing && (
            <div>
              <h3 className="fs-section-title">Edit policy for {editing.airport}</h3>
              <div className="fs-form-grid">
                <FormField
                  label="Curfew from"
                  type="time"
                  value={editing.curfewFrom}
                  onChange={(e) => setEditing({ ...editing, curfewFrom: e.target.value })}
                />
                <FormField
                  label="Curfew to"
                  type="time"
                  value={editing.curfewTo}
                  onChange={(e) => setEditing({ ...editing, curfewTo: e.target.value })}
                />
                <FormField
                  label="Max departures per hour"
                  type="number"
                  min={1}
                  value={String(editing.maxPerHour)}
                  onChange={(e) => setEditing({ ...editing, maxPerHour: Number(e.target.value) })}
                />
                <SelectField
                  label="Offers other times as"
                  value={editing.offers}
                  onChange={(e) => setEditing({ ...editing, offers: e.target.value as MockPolicy['offers'] })}
                >
                  <option>A list of slots</option>
                  <option>A time window</option>
                </SelectField>
              </div>
              <div className="fs-form-actions">
                <button type="button" className="fs-button" disabled={editing.maxPerHour < 1} onClick={save}>
                  Save policy
                </button>
                <button type="button" className="fs-button-ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Card>
        <Toast message={notice} />
      </main>
    </StaffShell>
  )
}
