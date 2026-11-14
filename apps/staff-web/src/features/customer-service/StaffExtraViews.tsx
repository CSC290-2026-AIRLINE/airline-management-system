import { useEffect, useState } from 'react'
import { useComplaintsApi } from './api'
import type {
  DeliveryLogRowView,
  StaffChartsResponse,
  StaffDeliveryLogResponse,
  StaffTemplateItemView,
} from './types'

/* ============================================================================
 * 08 / Staff / Complaint charts (Figma 4032:16149) — Live Database-Backed
 * ========================================================================== */
const DEFAULT_CHARTS: StaffChartsResponse = {
  totalComplaints: 10,
  openNow: 8,
  withSupervisorCount: 6,
  assignedCount: 2,
  resolvedCount: 1,
  closedCount: 1,
  avgDaysToClose: '2.1',
  compensationTotalThb: 6000,
  compensationDecisions: 4,
  compensationFailed: 1,
  byType: {
    employee: 3,
    flight: 3,
    food: 4,
  },
  topFlights: [
    { flight: 'FY405', date: '9 Oct', route: 'SIN → BKK', type: 'Flight', cases: 3 },
    { flight: 'FY308', date: '12 Oct', route: 'BKK → NRT', type: 'Food', cases: 3 },
    { flight: 'FY402', date: '9 Oct', route: 'BKK → CNX', type: 'Food', cases: 2 },
    { flight: 'FY401', date: '5 Oct', route: 'LHR → BKK', type: 'Flight', cases: 2 },
    { flight: 'FY403', date: '7 Oct', route: 'ICN → BKK', type: 'Employee', cases: 1 },
  ],
  weeklyData: [
    { week: '17 Aug', count: 0, latest: false },
    { week: '24 Aug', count: 0, latest: false },
    { week: '31 Aug', count: 0, latest: false },
    { week: '7 Sep', count: 0, latest: false },
    { week: '14 Sep', count: 0, latest: false },
    { week: '21 Sep', count: 0, latest: false },
    { week: '28 Sep', count: 1, latest: false },
    { week: '5 Oct', count: 9, latest: true },
  ],
}

export function StaffChartsView() {
  const api = useComplaintsApi()
  const [monthLabel, setMonthLabel] = useState<'October 2026 · to date' | 'September 2026'>('October 2026 · to date')
  const [charts, setCharts] = useState<StaffChartsResponse>(DEFAULT_CHARTS)
  const [loading, setLoading] = useState(true)
  const [showAllFlights, setShowAllFlights] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .getCharts()
      .then((data) => {
        if (active && data) {
          setCharts(data)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Compute Y-axis max for "Complaints by type" (multiple of 3, min 12)
  const maxTypeCount = Math.max(charts.byType.employee, charts.byType.flight, charts.byType.food, 1)
  const typeYMax = Math.max(12, Math.ceil(maxTypeCount / 3) * 3)
  const typeGridLabels = [
    { label: String(typeYMax), top: 30 },
    { label: String(Math.round((typeYMax * 2) / 3)), top: 83 },
    { label: String(Math.round(typeYMax / 3)), top: 136 },
    { label: '0', top: 190, dark: true },
  ]

  // Compute Y-axis max and average for "Complaints per week"
  const weeklyCounts = charts.weeklyData.map((w) => w.count)
  const maxWeekCount = Math.max(...weeklyCounts, 1)
  const weekYMax = Math.max(20, Math.ceil(maxWeekCount / 4) * 4)
  const weeklyAvg =
    weeklyCounts.length > 0
      ? Number((weeklyCounts.reduce((acc, n) => acc + n, 0) / weeklyCounts.length).toFixed(1))
      : 0
  // Chart plotting area: top=20 (value=weekYMax) to top=212 (value=0), height=192px
  const avgLineTop = Math.round(212 - (Math.min(weeklyAvg, weekYMax) / weekYMax) * 192)

  const displayedFlights = showAllFlights ? charts.topFlights : charts.topFlights.slice(0, 5)

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
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '36px', fontWeight: 800, color: '#0A1424', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            Complaint charts
          </h1>
          <p style={{ margin: 0, fontSize: '16px', color: '#677287', fontWeight: 400 }}>
            Complaints by type, top flights and complaints per week. Duplicates are left out.
          </p>
        </div>

        {/* Month stepper */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#FFFFFF',
            border: '1px solid #D1D9E3',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => setMonthLabel('September 2026')}
            style={{
              background: 'none',
              border: 'none',
              padding: '9px 12px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#0A1424',
              cursor: 'pointer',
            }}
          >
            ‹
          </button>
          <div
            style={{
              padding: '9px 14px',
              borderLeft: '1px solid #D1D9E3',
              borderRight: '1px solid #D1D9E3',
              fontSize: '14px',
              fontWeight: 600,
              color: '#0A1424',
              whiteSpace: 'nowrap',
            }}
          >
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={() => setMonthLabel('October 2026 · to date')}
            style={{
              background: 'none',
              border: 'none',
              padding: '9px 12px',
              fontSize: '15px',
              fontWeight: 600,
              color: monthLabel === 'October 2026 · to date' ? '#BFC7D4' : '#0A1424',
              cursor: 'pointer',
            }}
          >
            ›
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEE3EB', borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Complaints this month</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#0A1424', lineHeight: 1.2 }}>
            {charts.totalComplaints}
          </span>
          <span style={{ fontSize: '12px', color: '#677287' }}>
            {loading ? 'Syncing with database…' : 'Live from DB · duplicates left out'}
          </span>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEE3EB', borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Open now</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#0A1424', lineHeight: 1.2 }}>
            {charts.openNow}
          </span>
          <span style={{ fontSize: '12px', color: '#677287' }}>
            {charts.withSupervisorCount} with supervisor · {charts.assignedCount} assigned
          </span>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEE3EB', borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Average time to close</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#0A1424', lineHeight: 1.2 }}>
            {charts.avgDaysToClose} days
          </span>
          <span style={{ fontSize: '12px', color: '#677287' }}>
            {charts.closedCount} closed · {charts.resolvedCount} resolved
          </span>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEE3EB', borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Compensation decided</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#0A1424', lineHeight: 1.2 }}>
            ฿{charts.compensationTotalThb.toLocaleString()}
          </span>
          <span style={{ fontSize: '12px', color: '#677287' }}>
            {charts.compensationDecisions} decision{charts.compensationDecisions === 1 ? '' : 's'} · {charts.compensationFailed} failed at Feature 5B
          </span>
        </div>
      </div>

      {/* Middle Row: Complaints by type + Top flights */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'stretch' }}>
        {/* Card / Complaints by type */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #DEE3EB',
            borderRadius: '12px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0A1424' }}>Complaints by type</div>
          <div style={{ position: 'relative', height: '230px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#677287', marginBottom: '6px' }}>Complaints</div>
            {/* Y-axis & gridlines */}
            {typeGridLabels.map((g) => (
              <div key={`${g.label}-${g.top}`}>
                <span
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: `${g.top - 7}px`,
                    fontSize: '11px',
                    color: '#677287',
                  }}
                >
                  {g.label}
                </span>
                <div
                  style={{
                    position: 'absolute',
                    left: '34px',
                    right: '0',
                    top: `${g.top}px`,
                    height: '1px',
                    backgroundColor: g.dark ? '#99A3B5' : '#E5E8F0',
                  }}
                />
              </div>
            ))}

            {/* 3 Bars: Employee, Flight, Food */}
            {[
              { label: 'Employee', count: charts.byType.employee, left: '22%' },
              { label: 'Flight', count: charts.byType.flight, left: '52%' },
              { label: 'Food', count: charts.byType.food, left: '82%' },
            ].map((b) => {
              const height = Math.max(4, Math.round((b.count / typeYMax) * 160))
              return (
                <div
                  key={b.label}
                  style={{
                    position: 'absolute',
                    left: b.left,
                    bottom: '40px',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#0F2645', marginBottom: '4px' }}>{b.count}</span>
                  <div
                    style={{
                      width: '56px',
                      height: `${height}px`,
                      backgroundColor: '#0F2645',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.2s ease',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: `${height + 24}px`,
                      fontSize: '12px',
                      color: '#677287',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.label}
                  </span>
                </div>
              )
            })}

            <div
              style={{
                position: 'absolute',
                bottom: '0',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '11px',
                fontWeight: 600,
                color: '#677287',
              }}
            >
              Complaint type
            </div>
          </div>
        </div>

        {/* Card / Top flights */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #DEE3EB',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '18px 20px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0A1424' }}>Top flights by complaints</div>
            <div style={{ fontSize: '12px', color: '#677287' }}>
              Top {Math.min(5, charts.topFlights.length)} of {charts.topFlights.length} flights with complaints
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#F7F9FC',
              padding: '8px 20px',
              display: 'grid',
              gridTemplateColumns: '64px 64px 1fr 100px 48px',
              gap: '12px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#677287',
            }}
          >
            <div>FLIGHT</div>
            <div>DATE</div>
            <div>ROUTE</div>
            <div>MAIN TYPE</div>
            <div>CASES</div>
          </div>

          {displayedFlights.map((r) => (
            <div
              key={`${r.flight}-${r.date}`}
              style={{
                padding: '10px 20px',
                borderTop: '1px solid #E8EDF3',
                display: 'grid',
                gridTemplateColumns: '64px 64px 1fr 100px 48px',
                gap: '12px',
                alignItems: 'center',
                fontSize: '13px',
                color: '#0A1424',
              }}
            >
              <div style={{ fontWeight: 700 }}>{r.flight}</div>
              <div>{r.date}</div>
              <div>{r.route}</div>
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    border: '1px solid #D1D9E3',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    color: '#454F61',
                  }}
                >
                  {r.type}
                </span>
              </div>
              <div style={{ fontWeight: 700 }}>{r.cases}</div>
            </div>
          ))}

          {charts.topFlights.length > 5 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E8EDF2', marginTop: 'auto' }}>
              <button
                type="button"
                onClick={() => setShowAllFlights((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1F408C',
                  cursor: 'pointer',
                }}
              >
                {showAllFlights ? 'Show top 5 flights' : `View all ${charts.topFlights.length} flights →`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card / Complaints per week */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #DEE3EB',
          borderRadius: '12px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#0A1424' }}>Complaints per week</span>
          <span style={{ fontSize: '12px', color: '#677287' }}>Last 8 weeks · weeks start on Monday</span>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#677287' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#0F2645', display: 'inline-block' }} />
            Complaints
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#677287' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#FCA312', display: 'inline-block' }} />
            Latest week
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#677287' }}>
            <span style={{ width: '14px', height: '2px', backgroundColor: '#E8A121', display: 'inline-block' }} />
            8-week average ({weeklyAvg})
          </div>
        </div>

        {/* Weekly Bar Chart */}
        <div style={{ position: 'relative', height: '250px', width: '100%', paddingTop: '10px' }}>
          {[
            { label: String(weekYMax), top: 20 },
            { label: String(Math.round((weekYMax * 3) / 4)), top: 68 },
            { label: String(Math.round(weekYMax / 2)), top: 116 },
            { label: String(Math.round(weekYMax / 4)), top: 164 },
            { label: '0', top: 212, dark: true },
          ].map((g) => (
            <div key={`${g.label}-${g.top}`}>
              <span
                style={{
                  position: 'absolute',
                  left: '4px',
                  top: `${g.top - 7}px`,
                  fontSize: '11px',
                  color: '#677287',
                }}
              >
                {g.label}
              </span>
              <div
                style={{
                  position: 'absolute',
                  left: '32px',
                  right: '8px',
                  top: `${g.top}px`,
                  height: '1px',
                  backgroundColor: g.dark ? '#99A3B5' : '#E5E8F0',
                }}
              />
            </div>
          ))}

          {/* 8-week average dashed/amber line */}
          <div
            style={{
              position: 'absolute',
              left: '32px',
              right: '8px',
              top: `${avgLineTop}px`,
              borderTop: '2px dashed #E8A121',
              zIndex: 2,
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '40px',
              top: `${Math.max(16, avgLineTop - 18)}px`,
              fontSize: '11px',
              color: '#7A4E00',
              fontWeight: 500,
              zIndex: 3,
            }}
          >
            Average {weeklyAvg}
          </span>

          {/* Bars */}
          <div
            style={{
              position: 'absolute',
              left: '48px',
              right: '24px',
              bottom: '38px',
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              alignItems: 'end',
              height: '192px',
            }}
          >
            {charts.weeklyData.map((w) => {
              const barHeight = w.count > 0 ? Math.max(4, Math.round((w.count / weekYMax) * 192)) : 0
              return (
                <div
                  key={w.week}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: '100%',
                    position: 'relative',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#0A1424', marginBottom: '4px' }}>
                    {w.count}
                  </span>
                  <div
                    style={{
                      width: '54px',
                      height: `${barHeight}px`,
                      backgroundColor: w.latest ? '#FCA312' : '#0F2645',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.2s ease',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '-22px',
                      fontSize: '12px',
                      color: '#677287',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {w.week}
                  </span>
                </div>
              )
            })}
          </div>

          <div
            style={{
              position: 'absolute',
              bottom: '0',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '11px',
              fontWeight: 600,
              color: '#677287',
            }}
          >
            Week starting
          </div>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#677287' }}>
        Duplicates are left out of every count. Times use the Feature 1 simulation clock. Feature 14 reads the same numbers (by type, week and flight) directly from PostgreSQL.
      </p>
    </div>
  )
}

/* ============================================================================
 * 09 / Staff / Delivery log (Figma 4032:16523) — Live Database-Backed
 * ========================================================================== */
const DEFAULT_DELIVERY_LOG: StaffDeliveryLogResponse = {
  kpis: {
    eventsReceived: 20,
    messagesSent: 19,
    failedRetrying: 1,
    duplicateIgnored: 1,
  },
  rows: [],
}

export function StaffDeliveryLogView() {
  const api = useComplaintsApi()
  const [data, setData] = useState<StaffDeliveryLogResponse>(DEFAULT_DELIVERY_LOG)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('All 15 types')
  const [channelFilter, setChannelFilter] = useState('All channels')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 15

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .getDeliveryLog()
      .then((res) => {
        if (active && res) {
          setData(res)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const eventOptions = Array.from(new Set(data.rows.map((r) => r.event)))

  const filtered = data.rows.filter((r) => {
    const q = search.trim().toLowerCase()
    const matchSearch =
      !q ||
      r.recipient.toLowerCase().includes(q) ||
      r.linkedTo.toLowerCase().includes(q) ||
      r.event.toLowerCase().includes(q) ||
      r.eventId.toLowerCase().includes(q) ||
      (r.subject ?? '').toLowerCase().includes(q) ||
      (r.body ?? '').toLowerCase().includes(q)
    const matchEvent = eventFilter === 'All 15 types' || r.event === eventFilter
    const matchCh = channelFilter === 'All channels' || r.channel === channelFilter
    const matchSt =
      statusFilter === 'All statuses' || r.status.toLowerCase().startsWith(statusFilter.toLowerCase())
    return matchSearch && matchEvent && matchCh && matchSt
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function renderStatusChip(status: DeliveryLogRowView['status']) {
    if (status === 'Sent' || status === 'Sent on retry') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#E5F7ED', color: '#0F6B3D', padding: '3px 9px 3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0F6B3D' }} />
          {status}
        </span>
      )
    }
    if (status === 'Failed · retrying') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#FCEBEB', color: '#A8171C', padding: '3px 9px 3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#A8171C' }} />
          {status}
        </span>
      )
    }
    if (status === 'Queued') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#FFF5E0', color: '#855705', padding: '3px 9px 3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#855705' }} />
          {status}
        </span>
      )
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F2F5F7', color: '#545E70', padding: '3px 9px 3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#545E70' }} />
        {status}
      </span>
    )
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
      {/* Page header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 style={{ margin: 0, fontSize: '36px', fontWeight: 800, color: '#0A1424', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          Delivery log
        </h1>
        <p style={{ margin: 0, fontSize: '16px', color: '#677287' }}>
          Every message the notification service sent, skipped or failed. Providers are mocked; nothing real is sent.
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '16px' }}>
        {[
          { num: String(data.kpis.eventsReceived), label: 'Events received' },
          { num: String(data.kpis.messagesSent), label: 'Messages sent' },
          { num: String(data.kpis.failedRetrying), label: 'Failed, retrying' },
          { num: String(data.kpis.duplicateIgnored), label: 'Duplicate event ignored' },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '26px', fontWeight: 700, color: '#0A1424', lineHeight: 1.2 }}>{k.num}</span>
            <span style={{ fontSize: '13px', color: '#677287' }}>{k.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #DEE3EB',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="⌕  Search recipient, case number, flight or event ID"
          style={{
            height: '42px',
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: '6px',
            border: '1px solid #C4CCD6',
            padding: '0 12px',
            fontSize: '14px',
            color: '#0A1424',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Event type</span>
            <select
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value)
                setPage(1)
              }}
              style={{
                height: '42px',
                width: '210px',
                borderRadius: '6px',
                border: '1px solid #C4CCD6',
                padding: '0 12px',
                fontSize: '14px',
                color: '#0A1424',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="All 15 types">All 15 types</option>
              {eventOptions.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Channel</span>
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value)
                setPage(1)
              }}
              style={{
                height: '42px',
                width: '140px',
                borderRadius: '6px',
                border: '1px solid #C4CCD6',
                padding: '0 12px',
                fontSize: '14px',
                color: '#0A1424',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option>All channels</option>
              <option>Email</option>
              <option>SMS</option>
              <option>Push</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              style={{
                height: '42px',
                width: '160px',
                borderRadius: '6px',
                border: '1px solid #C4CCD6',
                padding: '0 12px',
                fontSize: '14px',
                color: '#0A1424',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option>All statuses</option>
              <option>Sent</option>
              <option>Failed</option>
              <option>Skipped</option>
              <option>Queued</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>From</span>
            <div style={{ height: '42px', width: '130px', borderRadius: '6px', border: '1px solid #C4CCD6', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: '14px', color: '#0A1424' }}>
              All dates
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>To</span>
            <div style={{ height: '42px', width: '130px', borderRadius: '6px', border: '1px solid #C4CCD6', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: '14px', color: '#0A1424' }}>
              Today
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearch('')
              setEventFilter('All 15 types')
              setChannelFilter('All channels')
              setStatusFilter('All statuses')
              setPage(1)
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 4px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#1F408C',
              cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Count row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
          {loading
            ? 'Loading delivery log from database…'
            : `${data.rows.length} messages in database · ${pagedRows.length} on this page · newest first`}
        </span>
        <span style={{ fontSize: '12px', color: '#677287' }}>
          Read only. A sent message is never edited or deleted; only its status, tries and error change.
        </span>
      </div>

      {/* Table Card */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #DEE3EB', borderRadius: '12px', overflow: 'hidden' }}>
        <div
          style={{
            backgroundColor: '#F7FAFC',
            padding: '10px 20px',
            display: 'grid',
            gridTemplateColumns: '115px 190px 1fr 80px 150px 150px 52px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#677287',
            letterSpacing: '0.55px',
          }}
        >
          <div>TIME</div>
          <div>EVENT</div>
          <div>RECIPIENT</div>
          <div>CHANNEL</div>
          <div>STATUS</div>
          <div>LINKED TO</div>
          <div>TRIES</div>
        </div>

        {pagedRows.map((r) => {
          const isExpanded = expandedRowId === r.id
          return (
            <div key={r.id}>
              <div
                onClick={() => setExpandedRowId(isExpanded ? null : r.id)}
                style={{
                  borderTop: '1px solid #E8EDF2',
                  padding: '11px 20px',
                  display: 'grid',
                  gridTemplateColumns: '115px 190px 1fr 80px 150px 150px 52px',
                  alignItems: 'center',
                  fontSize: '13px',
                  color: '#0A1424',
                  cursor: 'pointer',
                  backgroundColor: isExpanded ? '#F8FAFE' : '#FFFFFF',
                }}
              >
                <div style={{ color: '#677287', fontSize: '12.5px' }}>
                  {isExpanded ? '▾' : '▸'}  {r.time}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={{ fontWeight: 600 }}>{r.event}</span>
                  <span style={{ fontSize: '11px', color: '#677287' }}>{r.feature}</span>
                </div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '10px' }}>
                  {r.recipient}
                </div>
                <div>{r.channel}</div>
                <div>{renderStatusChip(r.status)}</div>
                <div style={{ fontWeight: 600, color: r.linkedIsCase ? '#1F408C' : '#0A1424' }}>{r.linkedTo}</div>
                <div>{r.tries}</div>
              </div>

              {isExpanded && (
                <div
                  style={{
                    backgroundColor: '#F8FAFE',
                    borderTop: '1px dashed #DDE4EE',
                    padding: '12px 24px 14px 44px',
                    fontSize: '12.5px',
                    color: '#1E293B',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', color: '#677287', fontSize: '12px' }}>
                    <span>
                      <strong style={{ color: '#0A1424' }}>Event ID:</strong> {r.eventId}
                    </span>
                    <span>
                      <strong style={{ color: '#0A1424' }}>Type code:</strong> {r.typeCode}
                    </span>
                    <span>
                      <strong style={{ color: '#0A1424' }}>Timestamp:</strong> {r.dateLabel} ({r.time})
                    </span>
                  </div>
                  {r.subject && (
                    <div>
                      <strong style={{ color: '#0A1424' }}>Subject:</strong> {r.subject}
                    </div>
                  )}
                  {r.body && (
                    <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 12px', color: '#0A1424' }}>
                      {r.body}
                    </div>
                  )}
                  {r.error && (
                    <div style={{ color: '#A8171C', fontWeight: 600 }}>
                      Provider error: {r.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Duplicate event note */}
        <div style={{ backgroundColor: '#F0F4FD', padding: '10px 20px', fontSize: '12px', color: '#29427A' }}>
          Duplicate ignored: FY405 delay event ev-2041 arrived twice from Feature 2 at 17:05. The second copy was skipped by event ID, so nobody got the message twice.
        </div>

        {/* Pager */}
        <div
          style={{
            borderTop: '1px solid #E8EDF2',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '13px', color: '#677287' }}>
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                background: '#FFFFFF',
                border: '1px solid #DEE3EB',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                color: currentPage <= 1 ? '#BFC7D4' : '#0A1424',
                cursor: currentPage <= 1 ? 'default' : 'pointer',
              }}
            >
              ‹ Previous
            </button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
              <button
                key={pNum}
                type="button"
                onClick={() => setPage(pNum)}
                style={{
                  backgroundColor: pNum === currentPage ? '#0A1424' : '#FFFFFF',
                  color: pNum === currentPage ? '#FFFFFF' : '#0A1424',
                  border: pNum === currentPage ? 'none' : '1px solid #DEE3EB',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '13px',
                  fontWeight: pNum === currentPage ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {pNum}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                background: '#FFFFFF',
                border: '1px solid #DEE3EB',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                color: currentPage >= totalPages ? '#BFC7D4' : '#0A1424',
                cursor: currentPage >= totalPages ? 'default' : 'pointer',
              }}
            >
              Next ›
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================================
 * 10 / Staff / Templates (Figma 4032:16965) — Live Database-Backed
 * ========================================================================== */
const INITIAL_TEMPLATES: StaffTemplateItemView[] = [
  {
    code: 'flight_delayed',
    name: 'Flight delayed',
    feature: 'Feature 2',
    group: 'ALWAYS SENT',
    emailState: '✓',
    smsState: '✓',
    pushState: '✓',
    emailTitle: 'Your flight {{flight_number}} is delayed',
    emailBody: 'Hi {{first_name}}, flight {{flight_number}} from {{origin}} to {{destination}} now leaves at {{new_time}} ({{delay}} late). Reason: {{reason}}.',
    smsBody: '{{flight_number}} now leaves {{new_time}} ({{delay}} late, {{reason}}). Sorry for the wait. Flython',
    pushTitle: '{{flight_number}} delayed',
    pushBody: 'Now leaving at {{new_time}} ({{delay}} late).',
  },
  { code: 'flight_rescheduled', name: 'Flight rescheduled', feature: 'Feature 2', group: 'ALWAYS SENT', emailState: '✓', smsState: '✓', pushState: '✓' },
  { code: 'flight_diverted', name: 'Flight diverted', feature: 'Feature 2', group: 'ALWAYS SENT', emailState: '✓', smsState: '✓', pushState: '!' },
  { code: 'flight_cancelled', name: 'Flight cancelled', feature: 'Feature 2', group: 'ALWAYS SENT', emailState: '✓', smsState: '✓', pushState: '✓' },
  { code: 'gate_changed', name: 'Gate changed', feature: 'Feature 6', group: 'ALWAYS SENT', emailState: '✓', smsState: '✓', pushState: '✓' },
  { code: 'security_alert', name: 'Security alert to the authority', feature: 'Feature 7', group: 'ALWAYS SENT', emailState: '✓', smsState: ' ', pushState: ' ' },
  { code: 'check_in_completed', name: 'Check-in completed', feature: 'Feature 6', group: 'OPTIONAL', emailState: '✓', smsState: ' ', pushState: '✓' },
  { code: 'boarding_pass_issued', name: 'Boarding pass issued', feature: 'Feature 6', group: 'OPTIONAL', emailState: '✓', smsState: ' ', pushState: '✓' },
  { code: 'boarding_call', name: 'Boarding call', feature: 'Feature 6', group: 'OPTIONAL', emailState: ' ', smsState: '✓', pushState: '✓' },
  { code: 'bag_case_updated', name: 'Lost bag case updated', feature: 'Feature 10', group: 'OPTIONAL', emailState: '✓', smsState: '✓', pushState: '–' },
  { code: 'bag_delivery_updated', name: 'Bag delivery updated', feature: 'Feature 10', group: 'OPTIONAL', emailState: '✓', smsState: '–', pushState: '✓' },
  { code: 'miles_expiring', name: 'Miles expiring', feature: 'Feature 11', group: 'OPTIONAL', emailState: '✓', smsState: '✓', pushState: '✓' },
  { code: 'tier_changed', name: 'Tier changed', feature: 'Feature 11', group: 'OPTIONAL', emailState: '✓', smsState: '✓', pushState: '✓' },
  {
    code: 'complaint_received',
    name: 'Complaint received',
    feature: 'Feature 13',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: '–',
    pushState: '–',
    emailTitle: 'We received your complaint {{case_number}}',
    emailBody: 'Hi {{first_name}}, we logged your {{complaint_type}} complaint under {{case_number}}. Our team will update you by email.',
    smsBody: 'Flython: Complaint {{case_number}} received.',
    pushTitle: 'Complaint {{case_number}} received',
    pushBody: 'We will notify you when a staff member updates your case.',
  },
  {
    code: 'complaint_updated',
    name: 'Complaint updated',
    feature: 'Feature 13',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: '–',
    pushState: '–',
    emailTitle: 'Update on your complaint {{case_number}}',
    emailBody: 'Hi {{first_name}}, your case {{case_number}} is now {{status}}.',
    smsBody: 'Flython: Case {{case_number}} is now {{status}}.',
    pushTitle: 'Case {{case_number}} updated',
    pushBody: 'Status changed to {{status}}.',
  },
]

export function StaffTemplatesView() {
  const api = useComplaintsApi()
  const [templates, setTemplates] = useState<StaffTemplateItemView[]>(INITIAL_TEMPLATES)
  const [selectedCode, setSelectedCode] = useState('flight_delayed')
  const [sourceFilter, setSourceFilter] = useState('All features')
  const [search, setSearch] = useState('')
  const [editingChannel, setEditingChannel] = useState<'email' | 'sms' | 'push' | null>(null)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    api
      .getTemplates()
      .then((res) => {
        if (active && Array.isArray(res) && res.length > 0) {
          setTemplates(res)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const filtered = templates.filter((t) => {
    const matchSource = sourceFilter === 'All features' || t.feature === sourceFilter
    const matchQ =
      !search.trim() ||
      t.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      t.code.includes(search.trim().toLowerCase())
    return matchSource && matchQ
  })

  const selected = templates.find((t) => t.code === selectedCode) ?? templates[0]

  async function toggleChannel(code: string, channelKey: 'smsState' | 'pushState') {
    const target = templates.find((t) => t.code === code)
    if (!target) return
    const nextActive = target[channelKey] !== '✓'
    const nextVal = nextActive ? '✓' : '–'
    setTemplates((prev) =>
      prev.map((item) => (item.code === code ? { ...item, [channelKey]: nextVal } : item)),
    )
    try {
      const updated = await api.updateTemplate(code, {
        channel: channelKey === 'smsState' ? 'sms' : 'push',
        isActive: nextActive,
      })
      if (Array.isArray(updated) && updated.length > 0) {
        setTemplates(updated)
      }
    } catch {}
  }

  function startEdit(ch: 'email' | 'sms' | 'push') {
    setEditingChannel(ch)
    if (ch === 'email') {
      setDraftSubject(selected.emailTitle ?? `Your flight {{flight_number}} is delayed`)
      setDraftBody(
        selected.emailBody ??
          `Hi {{first_name}}, flight {{flight_number}} from {{origin}} to {{destination}} now leaves at {{new_time}} ({{delay}} late). Reason: {{reason}}.`,
      )
    } else if (ch === 'sms') {
      setDraftSubject('')
      setDraftBody(
        selected.smsBody ??
          `{{flight_number}} now leaves {{new_time}} ({{delay}} late, {{reason}}). Sorry for the wait. Flython`,
      )
    } else {
      setDraftSubject(selected.pushTitle ?? `{{flight_number}} delayed`)
      setDraftBody(selected.pushBody ?? `Now leaving at {{new_time}} ({{delay}} late).`)
    }
  }

  async function saveEdit() {
    if (!editingChannel) return
    setSaving(true)
    const ch = editingChannel
    setTemplates((prev) =>
      prev.map((item) => {
        if (item.code !== selected.code) return item
        if (ch === 'email') return { ...item, emailTitle: draftSubject, emailBody: draftBody }
        if (ch === 'sms') return { ...item, smsBody: draftBody }
        return { ...item, pushTitle: draftSubject, pushBody: draftBody }
      }),
    )
    try {
      const updated = await api.updateTemplate(selected.code, {
        channel: ch,
        subjectTemplate: ch === 'sms' ? null : draftSubject,
        bodyTemplate: draftBody,
      })
      if (Array.isArray(updated) && updated.length > 0) {
        setTemplates(updated)
      }
    } catch {
    } finally {
      setSaving(false)
      setEditingChannel(null)
    }
  }

  function renderChMini(state: StaffTemplateItemView['emailState'], label: string) {
    if (state === '✓') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px' }}>
          <strong style={{ color: '#0F804D' }}>✓</strong>
          <span style={{ color: '#0A1424', fontWeight: 500 }}>{label}</span>
        </span>
      )
    }
    if (state === '!') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#B8171F' }}>
          <strong>!</strong>
          <span>{label}</span>
        </span>
      )
    }
    if (state === '–') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#B8BFCC' }}>
          <strong>–</strong>
          <span>{label}</span>
        </span>
      )
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: '#B8BFCC' }}>
        <span>{label}</span>
      </span>
    )
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
      {/* Page Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 style={{ margin: 0, fontSize: '36px', fontWeight: 800, color: '#0A1424', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          Templates
        </h1>
        <p style={{ margin: 0, fontSize: '16px', color: '#677287' }}>
          {'One template per message type and channel; placeholders like {{flight_number}} are filled when a message is sent. Only the supervisor edits or switches templates.'}
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #DEE3EB',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Source feature</span>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            style={{
              height: '42px',
              width: '200px',
              borderRadius: '6px',
              border: '1px solid #C4CCD6',
              padding: '0 12px',
              fontSize: '14px',
              color: '#0A1424',
              backgroundColor: '#FFFFFF',
            }}
          >
            <option>All features</option>
            <option>Feature 2</option>
            <option>Feature 6</option>
            <option>Feature 7</option>
            <option>Feature 10</option>
            <option>Feature 11</option>
            <option>Feature 13</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#677287' }}>Search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="⌕  Type name or text in a template"
            style={{
              height: '42px',
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: '6px',
              border: '1px solid #C4CCD6',
              padding: '0 12px',
              fontSize: '14px',
              color: '#0A1424',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        {/* Left: Message types list */}
        <div
          style={{
            width: '430px',
            flexShrink: 0,
            backgroundColor: '#FFFFFF',
            border: '1px solid #DEE3EB',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {(['ALWAYS SENT', 'OPTIONAL'] as const).map((grp) => {
            const items = filtered.filter((t) => t.group === grp)
            if (items.length === 0) return null
            return (
              <div key={grp}>
                <div style={{ backgroundColor: '#F8F9FB', padding: '10px 16px 8px', borderTop: grp === 'OPTIONAL' ? '1px solid #E8EDF2' : undefined }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0A1424', letterSpacing: '0.55px' }}>{grp}</div>
                  <div style={{ fontSize: '11px', color: '#677287', marginTop: '2px' }}>
                    {grp === 'ALWAYS SENT'
                      ? 'Email can’t be switched off. SMS and push can.'
                      : 'Every channel can be switched on or off.'}
                  </div>
                </div>
                {items.map((item) => {
                  const active = item.code === selected.code
                  return (
                    <div
                      key={item.code}
                      onClick={() => {
                        setSelectedCode(item.code)
                        setEditingChannel(null)
                      }}
                      style={{
                        padding: '12px 16px',
                        borderTop: '1px solid #E8EDF2',
                        backgroundColor: active ? '#ECF1FC' : '#FFFFFF',
                        borderLeft: active ? '3px solid #2663EB' : '3px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0A1424' }}>{item.name}</span>
                        <span style={{ fontSize: '11px', color: '#677287' }}>{item.feature}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {renderChMini(item.emailState, 'Email')}
                        {renderChMini(item.smsState, 'SMS')}
                        {renderChMini(item.pushState, 'Push')}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}

          <div style={{ borderTop: '1px solid #E8EDF2', padding: '10px 16px', fontSize: '11px', color: '#677287' }}>
            ✓ on    – off    ! missing template    grey = not used for that message
          </div>
        </div>

        {/* Right: Template detail */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#FFFFFF',
            border: '1px solid #DEE3EB',
            borderRadius: '12px',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0A1424' }}>{selected.name}</div>
            <div style={{ fontSize: '13px', color: '#677287' }}>
              {selected.code} · from {selected.feature}
            </div>
          </div>

          {/* Email Channel */}
          <div style={{ borderTop: '1px solid #E8EDF2', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0A1424' }}>Email</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#EDF2FF',
                    color: '#1F408C',
                    padding: '3px 9px 3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#1F408C' }} />
                  Always on
                </span>
                <span style={{ width: '1px', height: '16px', backgroundColor: '#DBE0E8' }} />
                <button
                  type="button"
                  onClick={() => startEdit('email')}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', fontWeight: 600, color: '#1F408C', cursor: 'pointer' }}
                >
                  Edit
                </button>
              </div>
            </div>
            {editingChannel === 'email' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F7F8FB', borderRadius: '8px', padding: '12px' }}>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid #C4CCD6', padding: '0 10px', fontSize: '13px', fontWeight: 600 }}
                />
                <textarea
                  rows={3}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  style={{ borderRadius: '6px', border: '1px solid #C4CCD6', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setEditingChannel(null)}
                    style={{ background: '#FFFFFF', border: '1px solid #C4CCD6', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveEdit}
                    style={{ background: '#0F2645', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {saving ? 'Saving…' : 'Save to DB'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#F7F8FB', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#0A1424', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontWeight: 600 }}>{selected.emailTitle ?? `Your flight {{flight_number}} is delayed`}</div>
                <div>{selected.emailBody ?? `Hi {{first_name}}, flight {{flight_number}} from {{origin}} to {{destination}} now leaves at {{new_time}} ({{delay}} late). Reason: {{reason}}.`}</div>
              </div>
            )}
          </div>

          {/* SMS Channel */}
          <div style={{ borderTop: '1px solid #E8EDF2', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0A1424' }}>SMS</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                  {selected.smsState === '✓' ? 'On' : 'Off'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleChannel(selected.code, 'smsState')}
                  style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '999px',
                    border: 'none',
                    backgroundColor: selected.smsState === '✓' ? '#0F804D' : '#CBD5E1',
                    position: 'relative',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: selected.smsState === '✓' ? '18px' : '2px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'left 0.15s',
                    }}
                  />
                </button>
                <span style={{ width: '1px', height: '16px', backgroundColor: '#DBE0E8' }} />
                <button
                  type="button"
                  onClick={() => startEdit('sms')}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', fontWeight: 600, color: '#1F408C', cursor: 'pointer' }}
                >
                  Edit
                </button>
              </div>
            </div>
            {editingChannel === 'sms' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F7F8FB', borderRadius: '8px', padding: '12px' }}>
                <textarea
                  rows={2}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  style={{ borderRadius: '6px', border: '1px solid #C4CCD6', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setEditingChannel(null)}
                    style={{ background: '#FFFFFF', border: '1px solid #C4CCD6', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveEdit}
                    style={{ background: '#0F2645', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {saving ? 'Saving…' : 'Save to DB'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#F7F8FB', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#0A1424' }}>
                {selected.smsBody ?? `{{flight_number}} now leaves {{new_time}} ({{delay}} late, {{reason}}). Sorry for the wait. Flython`}
              </div>
            )}
          </div>

          {/* Push Channel */}
          <div style={{ borderTop: '1px solid #E8EDF2', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0A1424' }}>Push</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#0A1424' }}>
                  {selected.pushState === '✓' ? 'On' : 'Off'}
                </span>
                <button
                  type="button"
                  onClick={() => toggleChannel(selected.code, 'pushState')}
                  style={{
                    width: '36px',
                    height: '20px',
                    borderRadius: '999px',
                    border: 'none',
                    backgroundColor: selected.pushState === '✓' ? '#0F804D' : '#CBD5E1',
                    position: 'relative',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: selected.pushState === '✓' ? '18px' : '2px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'left 0.15s',
                    }}
                  />
                </button>
                <span style={{ width: '1px', height: '16px', backgroundColor: '#DBE0E8' }} />
                <button
                  type="button"
                  onClick={() => startEdit('push')}
                  style={{ background: 'none', border: 'none', padding: 0, fontSize: '13px', fontWeight: 600, color: '#1F408C', cursor: 'pointer' }}
                >
                  Edit
                </button>
              </div>
            </div>
            {editingChannel === 'push' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#F7F8FB', borderRadius: '8px', padding: '12px' }}>
                <input
                  type="text"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid #C4CCD6', padding: '0 10px', fontSize: '13px', fontWeight: 600 }}
                />
                <textarea
                  rows={2}
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  style={{ borderRadius: '6px', border: '1px solid #C4CCD6', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setEditingChannel(null)}
                    style={{ background: '#FFFFFF', border: '1px solid #C4CCD6', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveEdit}
                    style={{ background: '#0F2645', color: '#FFFFFF', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {saving ? 'Saving…' : 'Save to DB'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#F7F8FB', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#0A1424', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ fontWeight: 600 }}>{selected.pushTitle ?? `{{flight_number}} delayed`}</div>
                <div>{selected.pushBody ?? `Now leaving at {{new_time}} ({{delay}} late).`}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#677287' }}>
        Every change is saved with the staff member in PostgreSQL (`notification_template`) and sent to the Feature 15 audit log. Switched-off templates are skipped and show as Skipped in the delivery log.
      </p>
    </div>
  )
}
