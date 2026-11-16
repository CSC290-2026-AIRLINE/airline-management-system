import { useEffect, useEffectEvent, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { useComplaintsApi } from './api'
import { BarChart } from './components/BarChart'
import { PageFrame } from './components/PageFrame'
import { StatCard } from './components/StatCard'
import type { StaffChartsResponse } from './types'

/* 08 / Staff / Complaint charts (Figma 4032:16149). Empty until the database answers; a failed load shows PageError. */
const EMPTY_CHARTS: StaffChartsResponse = {
  totalComplaints: 0,
  openNow: 0,
  withSupervisorCount: 0,
  assignedCount: 0,
  resolvedCount: 0,
  closedCount: 0,
  avgDaysToClose: '–',
  compensationTotalThb: 0,
  compensationDecisions: 0,
  compensationFailed: 0,
  byType: { employee: 0, flight: 0, food: 0 },
  topFlights: [],
  weeklyData: [],
}

const CURRENT_MONTH = 'October 2026 · to date'
const PREVIOUS_MONTH = 'September 2026'
const TOP_FLIGHTS = 5

export function ChartsPage() {
  const api = useComplaintsApi()
  const [monthLabel, setMonthLabel] = useState<typeof CURRENT_MONTH | typeof PREVIOUS_MONTH>(CURRENT_MONTH)
  const [charts, setCharts] = useState<StaffChartsResponse>(EMPTY_CHARTS)
  const [loading, setLoading] = useState(true)
  const [showAllFlights, setShowAllFlights] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)

  const fetchCharts = useEffectEvent(() => api.getCharts())

  useEffect(() => {
    let active = true
    fetchCharts()
      .then((data) => {
        if (active && data) {
          setCharts(data)
        }
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Rethrown during render so the route's PageError shows it; "Try again" remounts and refetches.
  if (loadError) throw loadError

  // Y-axis max for "Complaints by type" (multiple of 3, min 12)
  const maxTypeCount = Math.max(charts.byType.employee, charts.byType.flight, charts.byType.food, 1)
  const typeYMax = Math.max(12, Math.ceil(maxTypeCount / 3) * 3)

  // Y-axis max and average for "Complaints per week"
  const weeklyCounts = charts.weeklyData.map((w) => w.count)
  const maxWeekCount = Math.max(...weeklyCounts, 1)
  const weekYMax = Math.max(20, Math.ceil(maxWeekCount / 4) * 4)
  const weeklyAvg = weeklyCounts.length > 0 ? Number((weeklyCounts.reduce((acc, n) => acc + n, 0) / weeklyCounts.length).toFixed(1)) : 0

  const displayedFlights = showAllFlights ? charts.topFlights : charts.topFlights.slice(0, TOP_FLIGHTS)

  return (
    <PageFrame
      title="Complaint charts"
      description="Complaints by type, top flights and complaints per week. Duplicates are left out."
      actions={
        <div className="inline-flex items-center rounded-md border bg-card">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            disabled={monthLabel === PREVIOUS_MONTH}
            onClick={() => setMonthLabel(PREVIOUS_MONTH)}
          >
            <ChevronLeft />
          </Button>
          <span className="border-x px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-foreground">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            disabled={monthLabel === CURRENT_MONTH}
            onClick={() => setMonthLabel(CURRENT_MONTH)}
          >
            <ChevronRight />
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Complaints this month"
          value={charts.totalComplaints}
          hint={loading ? 'Syncing with database…' : 'Live from DB · duplicates left out'}
        />
        <StatCard
          label="Open now"
          value={charts.openNow}
          hint={`${charts.withSupervisorCount} with supervisor · ${charts.assignedCount} assigned`}
        />
        <StatCard
          label="Average time to close"
          value={charts.avgDaysToClose === '–' ? '–' : `${charts.avgDaysToClose} days`}
          hint={`${charts.closedCount} closed · ${charts.resolvedCount} resolved`}
        />
        <StatCard
          label="Compensation decided"
          value={`฿${charts.compensationTotalThb.toLocaleString()}`}
          hint={`${charts.compensationDecisions} decision${charts.compensationDecisions === 1 ? '' : 's'} · ${charts.compensationFailed} failed at Feature 5B`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="gap-3 px-5 py-4 shadow-none">
          <h2 className="text-base font-bold text-foreground">Complaints by type</h2>
          <span className="text-[11px] font-semibold text-muted-foreground">Complaints</span>
          <BarChart
            max={typeYMax}
            steps={3}
            xLabel="Complaint type"
            bars={[
              { label: 'Employee', value: charts.byType.employee },
              { label: 'Flight', value: charts.byType.flight },
              { label: 'Food', value: charts.byType.food },
            ]}
          />
        </Card>

        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <div className="flex flex-col gap-0.5 px-5 pt-4 pb-2.5">
            <h2 className="text-base font-bold text-foreground">Top flights by complaints</h2>
            <p className="text-xs text-muted-foreground">
              Top {Math.min(TOP_FLIGHTS, charts.topFlights.length)} of {charts.topFlights.length} flights with complaints
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-page hover:bg-page">
                <TableHead className="pl-5 text-[11px] text-muted-foreground uppercase">Flight</TableHead>
                <TableHead className="text-[11px] text-muted-foreground uppercase">Date</TableHead>
                <TableHead className="text-[11px] text-muted-foreground uppercase">Route</TableHead>
                <TableHead className="text-[11px] text-muted-foreground uppercase">Main type</TableHead>
                <TableHead className="pr-5 text-[11px] text-muted-foreground uppercase">Cases</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedFlights.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    No flights have complaints this month.
                  </TableCell>
                </TableRow>
              ) : (
                displayedFlights.map((r) => (
                  <TableRow key={`${r.flight}-${r.date}`} className="text-[13px] hover:bg-transparent">
                    <TableCell className="pl-5 font-bold">{r.flight}</TableCell>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{r.route}</TableCell>
                    <TableCell>
                      <span className="inline-block rounded-md border px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
                        {r.type}
                      </span>
                    </TableCell>
                    <TableCell className="pr-5 font-bold">{r.cases}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {charts.topFlights.length > TOP_FLIGHTS && (
            <div className="mt-auto border-t px-5 py-2">
              <Button variant="link" size="sm" className="px-0" onClick={() => setShowAllFlights((v) => !v)}>
                {showAllFlights ? `Show top ${TOP_FLIGHTS} flights` : `View all ${charts.topFlights.length} flights →`}
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card className="gap-3 px-5 py-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-foreground">Complaints per week</h2>
          <span className="text-xs text-muted-foreground">Last 8 weeks · weeks start on Monday</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-primary" aria-hidden="true" /> Complaints
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-gold" aria-hidden="true" /> Latest week
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 bg-gold" aria-hidden="true" /> 8-week average ({weeklyAvg})
          </span>
        </div>
        <BarChart
          max={weekYMax}
          steps={4}
          xLabel="Week starting"
          average={weeklyAvg}
          bars={charts.weeklyData.map((w) => ({ label: w.week, value: w.count, highlight: w.latest }))}
        />
      </Card>

      <p className="text-xs text-muted-foreground">
        Duplicates are left out of every count. Times use the Feature 1 simulation clock. Feature 14 reads the same numbers (by type, week
        and flight) directly from PostgreSQL.
      </p>
    </PageFrame>
  )
}
