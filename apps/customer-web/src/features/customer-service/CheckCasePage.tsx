import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  findComplaint,
  loadComplaints,
  STATUS_STEPS,
  STATUS_COLORS,
  CATEGORY_ICONS,
} from './types'
import type { Complaint } from './types'

interface SearchParams {
  caseId?: string
}

const STATUS_ORDER = ['Pending', 'In Review', 'Escalated', 'Resolved', 'Closed']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function CheckCasePage() {
  const navigate = useNavigate()
  const { caseId: initialCaseId } = useSearch({ strict: false }) as SearchParams
  const [inputValue, setInputValue] = useState(initialCaseId ?? '')
  const [complaint, setComplaint] = useState<Complaint | null>(
    initialCaseId ? (findComplaint(initialCaseId) ?? null) : null,
  )
  const [notFound, setNotFound] = useState(false)
  const [recentCases] = useState(() =>
    loadComplaints().slice(0, 3)
  )

  function search() {
    const id = inputValue.trim().toUpperCase()
    if (!id) return
    const found = findComplaint(id)
    if (found) {
      setComplaint(found)
      setNotFound(false)
      void navigate({ to: '/complaints/check', search: { caseId: id } })
    } else {
      setComplaint(null)
      setNotFound(true)
    }
  }

  const currentStepIdx = complaint ? STATUS_ORDER.indexOf(complaint.status) : -1

  return (
    <div style={pageStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>✈️</span>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>AMS Airlines</span>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: '/complaints' })}
          style={linkBtnStyle}
        >
          + New Complaint
        </button>
      </header>

      <div style={cardContainerStyle}>
        {/* Title */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
            🔍 Check a Case
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            Enter your case number to view the current status and history of your complaint.
          </p>
        </div>

        {/* Search Box */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <input
            type="text"
            placeholder="Enter case number e.g. CS-2026-00001"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            style={{
              flex: 1,
              padding: '11px 14px',
              borderRadius: '10px',
              border: '1.5px solid #e2e8f0',
              fontSize: '14px',
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button type="button" onClick={search} style={btnPrimary}>
            Search
          </button>
        </div>

        {/* Not found */}
        {notFound && (
          <div style={{
            padding: '16px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#dc2626',
            fontSize: '14px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <span style={{ fontSize: '18px' }}>❌</span>
            <div>
              <strong>Case not found</strong>
              <div style={{ fontSize: '13px', marginTop: '2px', color: '#ef4444' }}>
                No complaint was found with ID <code style={{ background: '#fee2e2', padding: '1px 6px', borderRadius: '4px' }}>{inputValue}</code>. Please check and try again.
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {complaint && (
          <div>
            {/* Case Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b, #334155)',
              borderRadius: '12px',
              padding: '20px',
              color: '#fff',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', opacity: 0.6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                    Case Number
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                    {complaint.id}
                  </div>
                </div>
                <div style={{
                  padding: '5px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: STATUS_COLORS[complaint.status].bg,
                  color: STATUS_COLORS[complaint.status].text,
                  border: `1.5px solid ${STATUS_COLORS[complaint.status].border}`,
                }}>
                  {complaint.status}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', opacity: 0.85, fontSize: '13px' }}>
                <div>
                  <div style={{ opacity: 0.6, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Category</div>
                  <div>{CATEGORY_ICONS[complaint.category]} {complaint.category}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.6, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Flight</div>
                  <div style={{ fontFamily: 'monospace' }}>{complaint.flightNumber}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.6, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Submitted</div>
                  <div>{new Date(complaint.submittedAt).toLocaleDateString('en-GB')}</div>
                </div>
              </div>
            </div>

            {/* Subject */}
            <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Subject</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{complaint.subject}</div>
            </div>

            {/* Supervisor badge */}
            {complaint.supervisorInvolved && (
              <div style={{
                marginBottom: '20px',
                padding: '12px 16px',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <span style={{ fontSize: '20px' }}>🔴</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#991b1b' }}>Supervisor Involved</div>
                  <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                    Your case has been escalated and assigned to a supervisor for priority handling.
                  </div>
                </div>
              </div>
            )}

            {/* Status Timeline */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#374151', marginBottom: '14px' }}>
                Case Status Timeline
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute',
                  left: '15px',
                  top: '10px',
                  bottom: '10px',
                  width: '2px',
                  background: '#e2e8f0',
                  zIndex: 0,
                }} />
                {STATUS_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStepIdx
                  const isCurrent = idx === currentStepIdx
                  return (
                    <div key={step.status} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '10px 0', position: 'relative', zIndex: 1 }}>
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700,
                        background: isDone ? (isCurrent ? '#3b82f6' : '#22c55e') : '#fff',
                        border: `2px solid ${isDone ? (isCurrent ? '#3b82f6' : '#22c55e') : '#d1d5db'}`,
                        color: isDone ? '#fff' : '#d1d5db',
                      }}>
                        {isDone && !isCurrent ? '✓' : idx + 1}
                      </div>
                      <div style={{ paddingTop: '4px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: isCurrent ? 700 : 600, color: isCurrent ? '#1e40af' : (isDone ? '#1e293b' : '#94a3b8') }}>
                            {step.label}
                          </span>
                          {isCurrent && (
                            <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{step.description}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Staff Notes visible to customer (non-internal only) */}
            {complaint.notes.filter((n) => !n.isInternal).length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>
                  Updates from Our Team
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {complaint.notes
                    .filter((n) => !n.isInternal)
                    .map((note) => (
                      <div key={note.id} style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: '#f0fdf4',
                        border: '1px solid #86efac',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>
                            📤 {note.author}
                          </span>
                          <span style={{ fontSize: '11px', color: '#86efac' }}>{formatDate(note.createdAt)}</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>{note.content}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Action */}
            <button
              type="button"
              onClick={() => void navigate({ to: '/complaints' })}
              style={{ ...btnSecondary, width: '100%', textAlign: 'center' }}
            >
              + Submit Another Complaint
            </button>
          </div>
        )}

        {/* Recent cases (when no search yet) */}
        {!complaint && !notFound && recentCases.length > 0 && (
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
              Recent Cases
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentCases.map((c) => {
                const col = STATUS_COLORS[c.status]
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setInputValue(c.id)
                      setComplaint(c)
                      setNotFound(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1.5px solid #e2e8f0',
                      background: '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: '#1e40af' }}>{c.id}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{c.subject}</div>
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: col.bg, color: col.text, border: `1px solid ${col.border}` }}>
                      {c.status}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 60%, #f0fdf4 100%)',
  fontFamily: 'system-ui, sans-serif',
}

const headerStyle: React.CSSProperties = {
  background: '#fff',
  borderBottom: '1px solid #e2e8f0',
  padding: '14px 28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const cardContainerStyle: React.CSSProperties = {
  maxWidth: '580px',
  margin: '40px auto',
  background: '#fff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  padding: '36px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
}

const btnPrimary: React.CSSProperties = {
  padding: '11px 20px',
  borderRadius: '10px',
  border: 'none',
  background: '#3b82f6',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const btnSecondary: React.CSSProperties = {
  padding: '11px 20px',
  borderRadius: '10px',
  border: '1.5px solid #e2e8f0',
  background: '#fff',
  color: '#374151',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
}

const linkBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1.5px solid #3b82f6',
  background: 'transparent',
  color: '#3b82f6',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
}
