import { useState, useEffect } from 'react'
import type { Complaint, ComplaintStatus, ComplaintCategory } from './types'
import {
  loadComplaints,
  updateComplaint,
  STATUS_COLORS,
  CATEGORY_ICONS,
} from './types'
import { ComplaintDetailPanel } from './ComplaintDetailPanel'

const ALL_STATUSES: ComplaintStatus[] = ['Pending', 'In Review', 'Escalated', 'Resolved', 'Closed']
const ALL_CATEGORIES: ComplaintCategory[] = ['Employee', 'Flight', 'Food']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ComplaintsDashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | 'All'>('All')
  const [filterCategory, setFilterCategory] = useState<ComplaintCategory | 'All'>('All')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [lastRefresh, setLastRefresh] = useState(Date.now())

  // Poll localStorage so new User submissions appear automatically
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(Date.now())
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setComplaints(loadComplaints())
  }, [lastRefresh])

  function handleUpdate(updated: Complaint) {
    updateComplaint(updated)
    setComplaints(loadComplaints())
    setSelected(updated)
  }

  const filtered = complaints.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.id.toLowerCase().includes(q) ||
      c.passengerName.toLowerCase().includes(q) ||
      c.passengerEmail.toLowerCase().includes(q) ||
      c.bookingRef.toLowerCase().includes(q) ||
      c.flightNumber.toLowerCase().includes(q)
    const matchStatus = filterStatus === 'All' || c.status === filterStatus
    const matchCategory = filterCategory === 'All' || c.category === filterCategory
    return matchSearch && matchStatus && matchCategory
  })

  // Stats
  const stats: Record<ComplaintStatus, number> = {
    Pending: 0,
    'In Review': 0,
    Escalated: 0,
    Resolved: 0,
    Closed: 0,
  }
  complaints.forEach((c) => { stats[c.status] = (stats[c.status] ?? 0) + 1 })

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f8fafc' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: '220px',
        background: '#1e293b',
        color: '#94a3b8',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #334155' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            ✈️ AMS Staff
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Customer Service Admin</div>
        </div>
        <nav style={{ padding: '12px 0' }}>
          {[
            { label: '📋 Complaints', active: true },
            { label: '🔔 Notifications', active: false },
            { label: '📊 Reports', active: false },
            { label: '⚙️ Settings', active: false },
          ].map(({ label, active }) => (
            <div
              key={label}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                cursor: 'pointer',
                background: active ? '#0f172a' : 'transparent',
                color: active ? '#fff' : '#94a3b8',
                borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
              }}
            >
              {label}
            </div>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #334155', fontSize: '12px', color: '#475569' }}>
          G16 · Customer Service
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <header style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '16px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>
              Complaints Inbox
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              {complaints.length} total · {stats.Pending} pending
            </p>
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            Auto-refresh every 2s
          </div>
        </header>

        {/* Stats Bar */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 28px',
          display: 'flex',
          gap: '12px',
        }}>
          {ALL_STATUSES.map((s) => {
            const col = STATUS_COLORS[s]
            return (
              <div
                key={s}
                onClick={() => setFilterStatus(filterStatus === s ? 'All' : s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: filterStatus === s ? col.bg : '#f1f5f9',
                  color: filterStatus === s ? col.text : '#64748b',
                  border: `1.5px solid ${filterStatus === s ? col.border : 'transparent'}`,
                  transition: 'all 0.15s',
                  userSelect: 'none',
                }}
              >
                {s} <span style={{ fontWeight: 400 }}>({stats[s]})</span>
              </div>
            )
          })}
        </div>

        {/* Filters & Search */}
        <div style={{
          padding: '14px 28px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <input
            type="text"
            placeholder="🔍  Search by Case ID, name, booking ref, flight..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1.5px solid #e2e8f0',
              fontSize: '14px',
              outline: 'none',
              background: '#fff',
            }}
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as ComplaintCategory | 'All')}
            style={selectStyle}
          >
            <option value="All">All Categories</option>
            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
          </select>
        </div>

        {/* Table Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
          {filtered.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '80px 20px',
              color: '#94a3b8',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#64748b' }}>No complaints found</div>
              <div style={{ fontSize: '14px', marginTop: '4px' }}>
                {complaints.length === 0
                  ? 'No complaints have been submitted yet. They will appear here automatically.'
                  : 'Try adjusting your search or filters.'}
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {/* Table Header */}
              <div style={tableHeaderStyle}>
                <div style={{ flex: '0 0 150px' }}>Case ID</div>
                <div style={{ flex: '0 0 110px' }}>Category</div>
                <div style={{ flex: 1 }}>Subject</div>
                <div style={{ flex: '0 0 160px' }}>Passenger</div>
                <div style={{ flex: '0 0 120px' }}>Flight</div>
                <div style={{ flex: '0 0 120px' }}>Status</div>
                <div style={{ flex: '0 0 150px' }}>Submitted</div>
              </div>
              {/* Rows */}
              {filtered.map((c) => {
                const col = STATUS_COLORS[c.status]
                const isSelected = selected?.id === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelected(c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0',
                      padding: '14px 20px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isSelected ? '#eff6ff' : (c.status === 'Pending' ? '#fffbeb' : '#fff'),
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background =
                        c.status === 'Pending' ? '#fffbeb' : '#fff'
                    }}
                  >
                    <div style={{ flex: '0 0 150px', fontWeight: 700, fontSize: '13px', color: '#1e40af', fontFamily: 'monospace' }}>
                      {c.supervisorInvolved && <span title="Supervisor involved" style={{ marginRight: '4px' }}>🔴</span>}
                      {c.id}
                    </div>
                    <div style={{ flex: '0 0 110px', fontSize: '13px' }}>
                      {CATEGORY_ICONS[c.category]} {c.category}
                    </div>
                    <div style={{ flex: 1, fontSize: '14px', color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '12px' }}>
                      {c.subject}
                    </div>
                    <div style={{ flex: '0 0 160px', fontSize: '13px', color: '#475569' }}>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.passengerName}</div>
                      <div style={{ fontSize: '12px' }}>{c.passengerEmail}</div>
                    </div>
                    <div style={{ flex: '0 0 120px', fontSize: '13px', fontFamily: 'monospace', color: '#475569' }}>
                      {c.flightNumber}<br />
                      <span style={{ fontSize: '12px' }}>{c.flightDate}</span>
                    </div>
                    <div style={{ flex: '0 0 120px' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: col.bg,
                        color: col.text,
                        border: `1px solid ${col.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {c.status}
                      </span>
                    </div>
                    <div style={{ flex: '0 0 150px', fontSize: '12px', color: '#94a3b8' }}>
                      {formatDate(c.submittedAt)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Detail Panel ── */}
      {selected && (
        <ComplaintDetailPanel
          complaint={selected}
          onUpdate={handleUpdate}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '9px 14px',
  borderRadius: '8px',
  border: '1.5px solid #e2e8f0',
  fontSize: '14px',
  outline: 'none',
  background: '#fff',
  cursor: 'pointer',
  minWidth: '150px',
}

const tableHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 20px',
  background: '#f8fafc',
  borderBottom: '2px solid #e2e8f0',
  fontSize: '12px',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  gap: '0',
}
