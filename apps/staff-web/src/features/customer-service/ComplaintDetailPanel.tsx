import { useState } from 'react'
import type { Complaint, ComplaintStatus, ComplaintNote } from './types'
import { STATUS_COLORS, CATEGORY_ICONS } from './types'

const ALL_STATUSES: ComplaintStatus[] = ['Pending', 'In Review', 'Escalated', 'Resolved', 'Closed']

interface Props {
  complaint: Complaint
  onUpdate: (updated: Complaint) => void
  onClose: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ComplaintDetailPanel({ complaint, onUpdate, onClose }: Props) {
  const [noteText, setNoteText] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [staffName, setStaffName] = useState('Staff Admin')

  function changeStatus(status: ComplaintStatus) {
    const updated: Complaint = {
      ...complaint,
      status,
      updatedAt: new Date().toISOString(),
    }
    onUpdate(updated)
  }

  function toggleSupervisor() {
    const updated: Complaint = {
      ...complaint,
      supervisorInvolved: !complaint.supervisorInvolved,
      updatedAt: new Date().toISOString(),
    }
    onUpdate(updated)
  }

  function addNote() {
    if (!noteText.trim()) return
    const note: ComplaintNote = {
      id: crypto.randomUUID(),
      author: staffName || 'Staff Admin',
      content: noteText.trim(),
      createdAt: new Date().toISOString(),
      isInternal,
    }
    const updated: Complaint = {
      ...complaint,
      notes: [...complaint.notes, note],
      updatedAt: new Date().toISOString(),
    }
    setNoteText('')
    onUpdate(updated)
  }

  const col = STATUS_COLORS[complaint.status]

  return (
    <div style={{
      width: '460px',
      flexShrink: 0,
      background: '#fff',
      borderLeft: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '18px 20px 14px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '15px',
              fontWeight: 700,
              color: '#1e40af',
            }}>{complaint.id}</span>
            <span style={{
              padding: '2px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              background: col.bg,
              color: col.text,
              border: `1px solid ${col.border}`,
            }}>{complaint.status}</span>
          </div>
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            Submitted {formatDate(complaint.submittedAt)}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: '#94a3b8',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >×</button>
      </div>

      {/* Scrollable Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* Category & Subject */}
        <Section title="Complaint Details">
          <InfoRow label="Category">
            <span>{CATEGORY_ICONS[complaint.category]} {complaint.category}</span>
          </InfoRow>
          <InfoRow label="Subject">
            <span style={{ fontWeight: 600, color: '#1e293b' }}>{complaint.subject}</span>
          </InfoRow>
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
              Description
            </div>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '14px',
              color: '#374151',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {complaint.description}
            </div>
          </div>
        </Section>

        {/* Booking & Flight */}
        <Section title="Booking & Flight">
          <InfoRow label="Booking Ref">
            <code style={codeStyle}>{complaint.bookingRef}</code>
          </InfoRow>
          <InfoRow label="Flight">
            <code style={codeStyle}>{complaint.flightNumber}</code>
          </InfoRow>
          <InfoRow label="Flight Date">
            <span>{complaint.flightDate}</span>
          </InfoRow>
        </Section>

        {/* Passenger */}
        <Section title="Passenger Information">
          <InfoRow label="Name">
            <span style={{ fontWeight: 600 }}>{complaint.passengerName}</span>
          </InfoRow>
          <InfoRow label="Email">
            <a href={`mailto:${complaint.passengerEmail}`} style={{ color: '#3b82f6' }}>
              {complaint.passengerEmail}
            </a>
          </InfoRow>
        </Section>

        {/* Status Management */}
        <Section title="Case Management">
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
              Update Status
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {ALL_STATUSES.map((s) => {
                const sc = STATUS_COLORS[s]
                const isActive = complaint.status === s
                return (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1.5px solid ${isActive ? sc.border : '#e2e8f0'}`,
                      background: isActive ? sc.bg : '#fff',
                      color: isActive ? sc.text : '#64748b',
                      transition: 'all 0.15s',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Supervisor toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px',
            background: complaint.supervisorInvolved ? '#fee2e2' : '#f8fafc',
            borderRadius: '8px',
            border: `1px solid ${complaint.supervisorInvolved ? '#fca5a5' : '#e2e8f0'}`,
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: complaint.supervisorInvolved ? '#991b1b' : '#374151' }}>
                🔴 Supervisor Involved
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Flag this case as requiring supervisor review
              </div>
            </div>
            <button
              onClick={toggleSupervisor}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: complaint.supervisorInvolved ? '#dc2626' : '#3b82f6',
                color: '#fff',
              }}
            >
              {complaint.supervisorInvolved ? 'Remove' : 'Flag'}
            </button>
          </div>
        </Section>

        {/* Notes / Timeline */}
        <Section title={`Notes & Activity (${complaint.notes.length})`}>
          {complaint.notes.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
              No notes yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {complaint.notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: note.isInternal ? '#fefce8' : '#f0fdf4',
                    border: `1px solid ${note.isInternal ? '#fde047' : '#86efac'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>
                      {note.isInternal ? '🔒 Internal' : '📤 Customer-facing'} · {note.author}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatDate(note.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {note.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Note Form */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
            <input
              placeholder="Your name"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              style={{ ...inputStyle, marginBottom: '8px', fontSize: '13px' }}
            />
            <textarea
              placeholder="Add a note or response..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', display: 'block', width: '100%' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                />
                Internal note only
              </label>
              <button
                onClick={addNote}
                disabled={!noteText.trim()}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: noteText.trim() ? '#3b82f6' : '#e2e8f0',
                  color: noteText.trim() ? '#fff' : '#94a3b8',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: noteText.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Add Note
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 700,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '10px',
        paddingBottom: '6px',
        borderBottom: '1px solid #f1f5f9',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
      <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, minWidth: '90px', paddingTop: '1px' }}>
        {label}
      </div>
      <div style={{ fontSize: '14px', color: '#374151', flex: 1 }}>
        {children}
      </div>
    </div>
  )
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  background: '#f1f5f9',
  padding: '1px 6px',
  borderRadius: '4px',
  fontSize: '13px',
  color: '#1e293b',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1.5px solid #e2e8f0',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
