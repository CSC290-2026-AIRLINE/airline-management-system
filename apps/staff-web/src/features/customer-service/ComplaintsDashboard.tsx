import { useEffect, useEffectEvent, useState } from 'react'
import { errorMessage, useComplaintsApi } from './api'
import {
  STATUS_LABEL,
  TYPE_LABEL,
  humanize,
  type CaseStatus,
  type Complaint,
  type ComplaintType,
} from './types'

const REFRESH_MS = 10_000

const STAFF_OWNERS = [
  'Ploy Wong',
  'Mali Rattana',
  'Somsak Jaidee',
  'Kenji Sato',
  'Tong Charoen',
]

function shortCaseNo(caseNumber: string): string {
  const parts = caseNumber.split('-')
  return parts[parts.length - 1] || caseNumber
}

function StatusPill({ status }: { status: CaseStatus }) {
  if (status === 'with_supervisor') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#FFF5E0',
          color: '#855705',
          padding: '3px 9px 3px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#D97706' }} />
        With supervisor
      </span>
    )
  }
  if (status === 'assigned') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#EDF2FF',
          color: '#1F408C',
          padding: '3px 9px 3px 8px',
          borderRadius: '6px',
          fontSize: '11.5px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563EB' }} />
        Assigned
      </span>
    )
  }
  if (status === 'resolved') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#E5F7ED',
          color: '#0F6B3D',
          padding: '3px 9px 3px 8px',
          borderRadius: '6px',
          fontSize: '11.5px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0F6B3D' }} />
        Resolved
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: '#F2F5F7',
        color: '#545E70',
        padding: '3px 9px 3px 8px',
        borderRadius: '6px',
        fontSize: '11.5px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#545E70' }} />
      Closed
    </span>
  )
}

function TypePill({ type }: { type: ComplaintType }) {
  return (
    <span
      style={{
        display: 'inline-block',
        border: '1px solid #D1D9E3',
        borderRadius: '6px',
        padding: '2px 8px',
        fontSize: '11.5px',
        fontWeight: 500,
        color: '#454F61',
        backgroundColor: '#FFFFFF',
        whiteSpace: 'nowrap',
      }}
    >
      {TYPE_LABEL[type]}
    </span>
  )
}

export function ComplaintsDashboard() {
  const api = useComplaintsApi()
  const [complaints, setComplaints] = useState<Complaint[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Figma Filters: TYPE (All | Employee | Flight | Food), STATUS (Open | Resolved | Closed | All), OWNER
  const [filterType, setFilterType] = useState<ComplaintType | 'all'>('all')
  const [filterStatusChip, setFilterStatusChip] = useState<'open' | 'resolved' | 'closed' | 'all'>('open')
  const [filterOwner, setFilterOwner] = useState<string>('Anyone')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Detail panel form state
  const [ownerDraft, setOwnerDraft] = useState<string>('')
  const [resolutionDraft, setResolutionDraft] = useState<string>('Not a duplicate')
  const [noteDraft, setNoteDraft] = useState<string>('')
  const [compTypeDraft, setCompTypeDraft] = useState<string>('Travel voucher')
  const [compAmountDraft, setCompAmountDraft] = useState<string>('1,000 THB')
  const [compReasonDraft, setCompReasonDraft] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const fetchList = useEffectEvent(() => api.list())

  useEffect(() => {
    let cancelled = false
    const tick = () =>
      fetchList().then(
        (rows) => {
          if (cancelled) return
          setComplaints(rows)
          setLoadError(null)
        },
        (e: unknown) => {
          if (!cancelled) setLoadError(errorMessage(e))
        },
      )
    void tick()
    const interval = setInterval(() => void tick(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [reloadToken])

  const all = complaints ?? []
  const openCasesCount = all.filter((c) => c.status === 'with_supervisor' || c.status === 'assigned').length
  const waitingOwnerCount = all.filter((c) => c.status === 'with_supervisor').length
  const resolvedCount = all.filter((c) => c.status === 'resolved').length
  const closedCount = all.filter((c) => c.status === 'closed').length
  const resolvedOrClosedCount = resolvedCount + closedCount

  const filtered = all.filter((c) => {
    const matchType = filterType === 'all' || c.type === filterType
    const matchStatus =
      filterStatusChip === 'all'
        ? true
        : filterStatusChip === 'open'
          ? c.status === 'with_supervisor' || c.status === 'assigned'
          : c.status === filterStatusChip
    const matchOwner =
      filterOwner === 'Anyone'
        ? true
        : filterOwner === 'Unassigned'
          ? !c.ownerName
          : c.ownerName === filterOwner
    return matchType && matchStatus && matchOwner
  })

  const selected = all.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    if (selected) {
      setOwnerDraft(selected.ownerName ?? '')
      setResolutionDraft('Not a duplicate')
      setNoteDraft('')
      setCompTypeDraft(selected.compensation?.type ?? 'Travel voucher')
      setCompAmountDraft(selected.compensation?.amount ?? '1,000 THB')
      setCompReasonDraft(selected.compensation?.reason ?? '')
    }
  }, [selected?.id])

  async function handleAssign() {
    if (!selected || !ownerDraft) return
    setBusy(true)
    try {
      await api.assignOwner(selected.id, ownerDraft)
      setReloadToken((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  async function handleResolve() {
    if (!selected || !selected.ownerName) return
    setBusy(true)
    try {
      await api.setStatus(selected.id, 'resolved', resolutionDraft)
      setReloadToken((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  async function handleAddNote() {
    if (!selected || !noteDraft.trim()) return
    setBusy(true)
    try {
      await api.addNote(selected.id, noteDraft.trim())
      setNoteDraft('')
      setReloadToken((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  async function handleSendComp() {
    if (!selected || !compReasonDraft.trim()) return
    setBusy(true)
    try {
      await api.sendCompensation(selected.id, {
        type: compTypeDraft,
        amount: compAmountDraft,
        reason: compReasonDraft.trim(),
        sentAt: new Date().toISOString(),
      })
      setReloadToken((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  async function handleCloseCase() {
    if (!selected) return
    setBusy(true)
    try {
      await api.setStatus(selected.id, 'closed')
      setReloadToken((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '48px 56px',
        maxWidth: '1120px',
        width: '100%',
        boxSizing: 'border-box',
        textAlign: 'left',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Page Header (Figma 4031:16169) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '36px',
            fontWeight: 800,
            color: '#0A1424',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}
        >
          Complaint queue
        </h1>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 400, color: '#677287' }}>
          Every new complaint comes here first. Assign it, add notes, decide compensation and close it.
        </p>
      </div>

      {/* 3 KPI Cards matching Figma node 4031:16382 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '26px', fontWeight: 700, color: '#0A1424', lineHeight: 1.2 }}>
            {openCasesCount}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 400, color: '#677287' }}>Open cases</span>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '26px', fontWeight: 700, color: '#0A1424', lineHeight: 1.2 }}>
            {waitingOwnerCount}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 400, color: '#677287' }}>Waiting for an owner</span>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '26px', fontWeight: 700, color: '#0A1424', lineHeight: 1.2 }}>
            {resolvedOrClosedCount}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 400, color: '#677287' }}>Resolved or closed</span>
        </div>
      </div>

      {loadError && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#991B1B',
            fontSize: '14px',
          }}
        >
          Could not load complaints: {loadError}
        </div>
      )}

      {/* Split View: Left Card / Complaints + Right Card / Case detail when selected */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', width: '100%' }}>
        {/* Left: Card / Complaints */}
        <div
          style={{
            width: selected ? '380px' : '100%',
            flexShrink: 0,
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 0.15s ease',
          }}
        >
          {/* Card Header */}
          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#0A1424' }}>Complaints</div>
            <div style={{ fontSize: '12px', color: '#677287', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span>Open first, unassigned on top ·</span>
              <span style={{ color: '#2563EB', fontSize: '10px' }}>●</span>
              <span>new since you last looked</span>
            </div>
          </div>

          {/* Filters Row (Figma 4031:16397 / 4031:16844) */}
          <div
            style={{
              padding: '0 18px 14px',
              display: 'flex',
              flexDirection: selected ? 'column' : 'row',
              flexWrap: 'wrap',
              alignItems: selected ? 'flex-start' : 'center',
              gap: selected ? '8px' : '10px 24px',
            }}
          >
            {/* Filter / TYPE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287', marginRight: '2px' }}>TYPE</span>
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'employee', label: 'Employee' },
                  { key: 'flight', label: 'Flight' },
                  { key: 'food', label: 'Food' },
                ] as const
              ).map((chip) => {
                const active = filterType === chip.key
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilterType(chip.key)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: active ? '1px solid #102544' : '1px solid #CBD5E1',
                      backgroundColor: active ? '#102544' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#0A1424',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      lineHeight: 1.2,
                    }}
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>

            {/* Filter / STATUS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287', marginRight: '2px' }}>STATUS</span>
              {(
                [
                  { key: 'open', label: 'Open' },
                  { key: 'resolved', label: 'Resolved' },
                  { key: 'closed', label: 'Closed' },
                  { key: 'all', label: 'All' },
                ] as const
              ).map((chip) => {
                const active = filterStatusChip === chip.key
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilterStatusChip(chip.key)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: active ? '1px solid #102544' : '1px solid #CBD5E1',
                      backgroundColor: active ? '#102544' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#0A1424',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      lineHeight: 1.2,
                    }}
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>

            {/* Filter / OWNER */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: selected ? '100%' : 'auto',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287' }}>OWNER</span>
              <select
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                style={{
                  flex: selected ? 1 : undefined,
                  width: selected ? undefined : '220px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0A1424',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="Anyone">Anyone</option>
                <option value="Unassigned">Unassigned</option>
                {STAFF_OWNERS.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Queue Table */}
          <div style={{ padding: '0 16px', width: '100%', boxSizing: 'border-box' }}>
            {!selected ? (
              /* Full 6-column table when NO case is selected (Figma 5009:29755) */
              <>
                <div
                  style={{
                    backgroundColor: '#F7FAFC',
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: '110px 96px 130px 1fr 145px 64px',
                    gap: '12px',
                    alignItems: 'center',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#677287',
                    borderRadius: '6px',
                  }}
                >
                  <div>CASE NO.</div>
                  <div>TYPE</div>
                  <div>FROM</div>
                  <div>SUMMARY</div>
                  <div>STATUS</div>
                  <div>AGE</div>
                </div>

                {filtered.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '14px', color: '#677287' }}>
                    No complaints match the current filters.
                  </div>
                ) : (
                  filtered.map((c) => {
                    const isRecent = c.age?.includes('min')
                    return (
                      <div
                        key={c.id}
                        onClick={() => setSelectedId(c.id)}
                        style={{
                          padding: '12px',
                          borderBottom: '1px solid #EEF1F5',
                          display: 'grid',
                          gridTemplateColumns: '110px 96px 130px 1fr 145px 64px',
                          gap: '12px',
                          alignItems: 'start',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#0A1424',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: c.unread ? 700 : 600 }}>
                          {c.unread && (
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: '#2563EB',
                                display: 'inline-block',
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span>{shortCaseNo(c.caseNumber)}</span>
                        </div>
                        <div>
                          <TypePill type={c.type} />
                        </div>
                        <div>{c.fromSource ?? 'Customer'}</div>
                        <div
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.summary ?? c.description}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                          <StatusPill status={c.status} />
                          <span style={{ fontSize: '12px', color: '#677287' }}>
                            {c.ownerName ?? 'Unassigned'}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: isRecent ? 600 : 400,
                            color: isRecent ? '#2663EB' : '#677287',
                          }}
                        >
                          {c.age ?? '1 d'}
                        </div>
                      </div>
                    )
                  })
                )}
              </>
            ) : (
              /* Compact 3-column table when a case IS selected (Figma 5009:31832) */
              <>
                <div
                  style={{
                    backgroundColor: '#F7FAFC',
                    padding: '10px 8px',
                    display: 'grid',
                    gridTemplateColumns: '84px 72px 1fr',
                    gap: '10px',
                    alignItems: 'center',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#677287',
                    borderRadius: '6px',
                  }}
                >
                  <div>CASE NO.</div>
                  <div>TYPE</div>
                  <div>SUMMARY</div>
                </div>

                {filtered.map((c) => {
                  const isSelected = c.id === selected.id
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      style={{
                        padding: '12px 8px',
                        borderBottom: '1px solid #EEF1F5',
                        backgroundColor: isSelected ? '#E8EEF7' : 'transparent',
                        display: 'grid',
                        gridTemplateColumns: '84px 72px 1fr',
                        gap: '10px',
                        alignItems: 'start',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#0A1424',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: c.unread ? 700 : 600 }}>
                        {c.unread && (
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: '#2563EB',
                              display: 'inline-block',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span>{shortCaseNo(c.caseNumber)}</span>
                      </div>
                      <div>
                        <TypePill type={c.type} />
                      </div>
                      <div style={{ lineHeight: 1.35 }}>{c.summary ?? c.description}</div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Card Footer (Figma 4031:16505) */}
          <div
            style={{
              backgroundColor: '#F7F9FC',
              borderTop: '1px solid #E8EDF3',
              padding: '11px 18px',
              fontSize: '12px',
              color: '#677287',
              textAlign: 'left',
            }}
          >
            {openCasesCount} open · {resolvedCount} resolved · {closedCount} closed
          </div>
        </div>

        {/* Right: Card / Case detail (Figma 4031:16507) */}
        {selected && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              textAlign: 'left',
            }}
          >
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#0A1424' }}>{selected.caseNumber}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                <TypePill type={selected.type} />
                <StatusPill status={selected.status} />
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                title="Close panel"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 0 0 8px',
                  fontSize: '18px',
                  color: '#667387',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Opened subtitle */}
            <div style={{ fontSize: '12px', color: '#677287', marginTop: '-8px' }}>
              {selected.openedLabel ?? 'Opened 12 Oct 20:14 by the customer'}
            </div>

            {/* Facts Grid (3 rows x 2 columns) */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '8px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287' }}>FROM</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                    {selected.passengerName} · {selected.fromSource ?? 'Customer'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287' }}>CONTACT</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                    {selected.contactEmail ?? '—'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '8px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287' }}>BOOKING</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                    {selected.bookingRef ?? 'FLY7K2'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287' }}>FLIGHT</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                    {selected.flightRoute ?? `${selected.flightNumber ?? 'FY308'} · Mon 12 Oct`}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '8px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287' }}>
                    {selected.type === 'food' ? 'MEAL' : selected.type === 'employee' ? 'LOCATION' : 'DETAILS'}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                    {selected.mealDetail ?? (selected.location ? humanize(selected.location) : '—')}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#677287' }}>ISSUE</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                    {humanize(selected.issue ?? 'missing')}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer quote box */}
            <div
              style={{
                backgroundColor: '#F7F9FC',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                color: '#0A1424',
                lineHeight: 1.45,
              }}
            >
              “{selected.description}”
            </div>

            {/* Actions Box (Figma 4031:16543) */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E8EDF3',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* 1. Owner */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ width: '120px', flexShrink: 0, paddingTop: '10px', fontSize: '13px', fontWeight: 600, color: '#677287' }}>
                  Owner
                </div>
                <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    value={ownerDraft}
                    onChange={(e) => setOwnerDraft(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #D1D9E3',
                      backgroundColor: '#FFFFFF',
                      fontSize: '14px',
                      color: ownerDraft ? '#0A1424' : '#677287',
                      outline: 'none',
                    }}
                  >
                    <option value="">Pick who handles this case</option>
                    {STAFF_OWNERS.map((owner) => (
                      <option key={owner} value={owner}>
                        {owner}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || !ownerDraft}
                    onClick={() => void handleAssign()}
                    style={{
                      backgroundColor: '#0A1424',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: busy || !ownerDraft ? 'not-allowed' : 'pointer',
                      opacity: busy || !ownerDraft ? 0.65 : 1,
                    }}
                  >
                    Assign
                  </button>
                </div>
              </div>

              {/* 2. Resolution */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ width: '120px', flexShrink: 0, paddingTop: '10px', fontSize: '13px', fontWeight: 600, color: '#677287' }}>
                  Resolution
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={resolutionDraft}
                      disabled={!selected.ownerName}
                      onChange={(e) => setResolutionDraft(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #D1D9E3',
                        backgroundColor: selected.ownerName ? '#FFFFFF' : '#F4F6F9',
                        fontSize: '14px',
                        color: selected.ownerName ? '#0A1424' : '#677287',
                        outline: 'none',
                      }}
                    >
                      <option value="Not a duplicate">Not a duplicate</option>
                      <option value="Duplicate case">Duplicate case</option>
                      <option value="Customer withdrew">Customer withdrew</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy || !selected.ownerName || selected.status === 'resolved' || selected.status === 'closed'}
                      onClick={() => void handleResolve()}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: selected.ownerName ? '1px solid #D1D9E3' : '1px solid #E5E8ED',
                        color: selected.ownerName ? '#0A1424' : '#B2BAC4',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: !selected.ownerName ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Resolve
                    </button>
                  </div>
                  {!selected.ownerName && (
                    <span style={{ fontSize: '12px', color: '#677287' }}>
                      Assign an owner first. A case with no owner can’t be resolved.
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Internal note */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ width: '120px', flexShrink: 0, paddingTop: '10px', fontSize: '13px', fontWeight: 600, color: '#677287' }}>
                  Internal note
                </div>
                <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Staff only. Never shown to the customer."
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #D1D9E3',
                      backgroundColor: '#FFFFFF',
                      fontSize: '14px',
                      color: '#0A1424',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || !noteDraft.trim()}
                    onClick={() => void handleAddNote()}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D1D9E3',
                      color: '#0A1424',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: busy || !noteDraft.trim() ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Add note
                  </button>
                </div>
              </div>

              {/* 4. Compensation · Supervisor only */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ width: '120px', flexShrink: 0, paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#677287' }}>Compensation</span>
                  <span style={{ fontSize: '11px', color: '#677287' }}>Supervisor only</span>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={compTypeDraft}
                      onChange={(e) => setCompTypeDraft(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #D1D9E3',
                        backgroundColor: '#FFFFFF',
                        fontSize: '14px',
                        color: '#0A1424',
                        outline: 'none',
                      }}
                    >
                      <option value="Travel voucher">Travel voucher</option>
                      <option value="Cash refund">Cash refund</option>
                      <option value="Bonus miles">Bonus miles</option>
                    </select>
                    <input
                      type="text"
                      value={compAmountDraft}
                      onChange={(e) => setCompAmountDraft(e.target.value)}
                      style={{
                        width: '130px',
                        boxSizing: 'border-box',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #D1D9E3',
                        backgroundColor: '#FFFFFF',
                        fontSize: '14px',
                        color: '#0A1424',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <input
                    type="text"
                    value={compReasonDraft}
                    onChange={(e) => setCompReasonDraft(e.target.value)}
                    placeholder="Reason (required, the customer sees it)"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #D1D9E3',
                      backgroundColor: '#FFFFFF',
                      fontSize: '14px',
                      color: '#0A1424',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                    <button
                      type="button"
                      disabled={busy || !compReasonDraft.trim()}
                      onClick={() => void handleSendComp()}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #D1D9E3',
                        color: '#0A1424',
                        borderRadius: '8px',
                        padding: '10px 16px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: busy || !compReasonDraft.trim() ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Send to Feature 5B
                    </button>
                    <span style={{ fontSize: '12px', color: '#677287' }}>
                      One live decision per case. Audit entry in Feature 15 first.
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: '#E8EDF2', width: '100%' }} />

              {/* 5. Close case row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: '#677287', flex: 1 }}>
                  Close only after Resolved. Every change goes to the history and the Feature 15 audit log.
                </span>
                <button
                  type="button"
                  disabled={busy || selected.status === 'closed'}
                  onClick={() => void handleCloseCase()}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #EDA8A8',
                    color: '#B8171F',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: busy || selected.status === 'closed' ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Close case
                </button>
              </div>
            </div>

            {/* History and internal notes (Figma 5552:35770) */}
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0A1424' }}>
              History and internal notes
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(selected.events ?? []).map((ev, idx, arr) => {
                const isLast = idx === arr.length - 1
                const headerText = ev.timeLabel
                  ? `${ev.timeLabel} · ${ev.actorLabel ?? 'System'}`
                  : `12 Oct 20:14 · ${ev.actorName ?? 'System'}`
                const bodyText =
                  ev.title ??
                  ev.note ??
                  (ev.type === 'created'
                    ? `Created by customer (${selected.contactEmail ?? ''})`
                    : ev.toValue
                      ? `Status changed to ${STATUS_LABEL[ev.toValue as CaseStatus] ?? ev.toValue}`
                      : humanize(ev.type))

                return (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'stretch', gap: '14px' }}>
                    {/* Rail */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        paddingTop: '4px',
                        width: '12px',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: isLast ? '#2563EB' : '#94A3B8',
                          border: isLast ? '2px solid #DBEAFE' : 'none',
                          flexShrink: 0,
                        }}
                      />
                      {!isLast && (
                        <div
                          style={{
                            width: '2px',
                            flex: 1,
                            backgroundColor: '#E1E6ED',
                            marginTop: '4px',
                          }}
                        />
                      )}
                    </div>

                    {/* Text */}
                    <div style={{ paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                      <span style={{ fontSize: '12px', color: '#677287' }}>{headerText}</span>
                      <span style={{ fontSize: '14px', color: '#0A1424' }}>{bodyText}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
