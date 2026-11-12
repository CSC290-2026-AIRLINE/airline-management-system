import { useEffect, useEffectEvent, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnPrimary, inputStyle, mutedStyle } from './styles'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, STATUS_LABEL, TYPES, optionLabel, type CaseEvent, type Complaint } from './types'
import { formatDateTime } from './format'
import { ComplaintPage, StatusSteps } from './ui'

function describeEvent(e: CaseEvent): string {
  switch (e.type) {
    case 'created':
      return 'You submitted the complaint'
    case 'assigned':
      return 'An agent took your case'
    case 'status_changed':
      return `Status changed to ${STATUS_LABEL[e.toValue as keyof typeof STATUS_LABEL] ?? e.toValue}`
    case 'closed':
      return 'The case was closed'
    case 'reopened':
      return 'The case was reopened'
    default:
      return 'The case was updated'
  }
}

function summary(c: Complaint): string {
  if (c.type === 'employee') return `Employee · ${optionLabel(LOCATIONS, c.location)}`
  const issues = c.type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES
  return `${c.type === 'food' ? 'Food' : 'Flight'} · ${optionLabel(issues, c.issue)} · ${c.flightNumber} on ${c.serviceDate}`
}

export function CheckCasePage() {
  const navigate = useNavigate()
  const { caseNumber } = useSearch({ from: '/_authenticated/complaints/check' })
  const api = useComplaintsApi()

  const [input, setInput] = useState(caseNumber ?? '')
  const [cases, setCases] = useState<Complaint[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [caseError, setCaseError] = useState<string | null>(null)

  const fetchList = useEffectEvent(() => api.list())
  const fetchCase = useEffectEvent((n: string) => api.get(n))

  // The customer's own cases, newest first.
  useEffect(() => {
    let cancelled = false
    fetchList().then(
      (rows) => {
        if (!cancelled) setCases(rows)
      },
      (e: unknown) => {
        if (!cancelled) setListError(errorMessage(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // The case named in the URL. Only the caller's own cases are found; anything else is "not found".
  useEffect(() => {
    if (!caseNumber) return
    let cancelled = false
    fetchCase(caseNumber).then(
      (row) => {
        if (cancelled) return
        setComplaint(row)
        setCaseError(null)
      },
      (e: unknown) => {
        if (cancelled) return
        setComplaint(null)
        setCaseError(errorMessage(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [caseNumber])

  function open(n: string) {
    const value = n.trim().toUpperCase()
    if (!value) return
    setInput(value)
    void navigate({ to: '/complaints/check', search: { caseNumber: value } })
  }

  const shown = caseNumber && complaint?.caseNumber === caseNumber.toUpperCase() ? complaint : null

  return (
    <ComplaintPage>
      <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 700 }}>My cases</h1>
      <p style={{ ...mutedStyle, margin: '0 0 20px' }}>Open one of your complaints, or enter its case number.</p>

      <form
        style={{ display: 'flex', gap: '10px' }}
        onSubmit={(e) => {
          e.preventDefault()
          open(input)
        }}
      >
        <label htmlFor="cs-case" style={{ position: 'absolute', left: '-9999px' }}>
          Case number
        </label>
        <input
          id="cs-case"
          placeholder="CS-2026-000001"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          style={{ ...inputStyle, fontFamily: 'monospace' }}
        />
        <button type="submit" style={{ ...btnPrimary, flex: '0 0 auto' }}>
          Open
        </button>
      </form>

      {caseError && caseNumber && (
        <div role="alert" style={{ ...alertStyle, marginTop: '16px' }}>
          {caseError}
        </div>
      )}

      {shown && (
        <section style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: '#1e40af' }}>{shown.caseNumber}</div>
          <div style={mutedStyle}>
            {summary(shown)} · submitted {formatDateTime(shown.openedAt)}
          </div>
          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              background: '#f8fafc',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            {shown.description}
          </p>

          <h2 style={{ fontSize: '15px', margin: '20px 0 12px' }}>Progress</h2>
          <StatusSteps status={shown.status} />

          {shown.events && shown.events.length > 0 && (
            <>
              <h2 style={{ fontSize: '15px', margin: '20px 0 8px' }}>History</h2>
              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px' }}>
                {shown.events.map((e) => (
                  <li key={e.id}>
                    {describeEvent(e)} <span style={mutedStyle}>· {formatDateTime(e.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '15px', margin: '0 0 12px' }}>All my complaints</h2>
        {listError && (
          <div role="alert" style={alertStyle}>
            {listError}
          </div>
        )}
        {!listError && cases === null && <p style={mutedStyle}>Loading…</p>}
        {cases?.length === 0 && <p style={mutedStyle}>You haven't made any complaints yet.</p>}
        {cases && cases.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => open(c.caseNumber)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: `1.5px solid ${c.caseNumber === shown?.caseNumber ? '#2563eb' : '#e2e8f0'}`,
                    background: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <span>
                    <span style={{ display: 'block', fontFamily: 'monospace', fontWeight: 700 }}>
                      {TYPES.find((t) => t.value === c.type)?.icon} {c.caseNumber}
                    </span>
                    <span style={{ display: 'block', ...mutedStyle }}>{summary(c)}</span>
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ComplaintPage>
  )
}
