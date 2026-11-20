import { useId, type ReactNode } from 'react'
import { Card } from '@staff-web/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import type { BiCabinRow, BiPeriodBookings, BiPeriodRow, BiRevenueMode, BiGroup } from '../api/bi'
import { BI_COLORS } from '../chart-colors'
import { formatCount, formatMoney, formatPercent } from '../lib-format'

export function ChartFrame({
  title,
  subtitle,
  legend,
  toolbar,
  children,
  wide = false,
}: {
  title: string
  subtitle?: string
  legend?: { label: string; color: string }[]
  toolbar?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Card className={`bi-chart-card${wide ? ' bi-chart-wide' : ''}`}>
      <div className="bi-chart-heading">
        <h2>{title}</h2>
        {subtitle && <span>{subtitle}</span>}
      </div>
      {(legend || toolbar) && (
        <div className="bi-chart-toolbar">
          <div className="bi-legend">
            {legend?.map((item) => (
              <span key={item.label}>
                <i style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
          {toolbar}
        </div>
      )}
      <TooltipProvider delayDuration={80}>{children}</TooltipProvider>
    </Card>
  )
}

export function ChartHit({
  x,
  y,
  width,
  height,
  detail,
  description,
  onPick,
}: {
  x: number
  y: number
  width: number
  height: number
  detail: string
  description?: string
  onPick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="transparent"
          tabIndex={0}
          role={onPick ? 'button' : 'img'}
          aria-label={detail}
          className="bi-chart-hit"
          onClick={onPick}
          onKeyDown={(event) => {
            if (onPick && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              onPick()
            }
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="bi-chart-tooltip">
        <strong>{detail}</strong>
        {description && <span>{description}</span>}
        {onPick && <span>Click to see the flights behind this figure.</span>}
      </TooltipContent>
    </Tooltip>
  )
}

function periodLabel(period: string, group: BiGroup): string {
  return new Intl.DateTimeFormat(
    'en-GB',
    group === 'month' ? { month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' },
  )
    .format(new Date(`${period}T00:00:00Z`))
    .replace('Sept', 'Sep')
}

const PLOT = { left: 52, right: 470, top: 22, bottom: 196 }
const plotWidth = PLOT.right - PLOT.left
const plotHeight = PLOT.bottom - PLOT.top

function Axis({
  ticks,
  y,
  format,
  unit,
  labels,
  xLabel,
}: {
  ticks: number[]
  y: (v: number) => number
  format: (v: number) => string
  unit: string
  labels: string[]
  xLabel: string
}) {
  const every = Math.max(1, Math.ceil(labels.length / 8))
  return (
    <g className="bi-chart-axis">
      <text x={0} y={10} className="bi-axis-title">
        {unit}
      </text>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} stroke={tick === ticks[0] ? '#9aa3b5' : '#e6e9ef'} />
          <text x={PLOT.left - 10} y={y(tick) + 4} textAnchor="end">
            {format(tick)}
          </text>
        </g>
      ))}
      {labels.map(
        (label, index) =>
          index % every === 0 && (
            <text key={`${label}-${index}`} x={PLOT.left + ((index + 0.5) * plotWidth) / labels.length} y={215} textAnchor="middle">
              {label}
            </text>
          ),
      )}
      <text x={261} y={232} textAnchor="middle" className="bi-axis-title">
        {xLabel}
      </text>
    </g>
  )
}

function EmptyChart() {
  return <div className="bi-chart-empty">No data for this period.</div>
}
function groupLabel(group: BiGroup) {
  return group === 'week' ? 'Week starting' : group === 'month' ? 'Month' : 'Date'
}

export function OnTimeChart({ rows, group, onPick }: { rows: BiPeriodRow[]; group: BiGroup; onPick: (period: string) => void }) {
  const titleId = useId()
  const values = rows.flatMap((row) => (row.on_time_pct === null ? [] : [row.on_time_pct]))
  const low = Math.min(0.6, ...values)
  const high = Math.max(1, ...values)
  const y = (value: number) => PLOT.bottom - ((value - low) / (high - low)) * plotHeight
  const x = (index: number) => PLOT.left + ((index + 0.5) * plotWidth) / rows.length
  const ticks = Array.from({ length: 5 }, (_, i) => low + (i * (high - low)) / 4)
  const path = rows
    .map((row, index) =>
      row.on_time_pct === null ? '' : `${index > 0 && rows[index - 1].on_time_pct !== null ? 'L' : 'M'}${x(index)} ${y(row.on_time_pct)}`,
    )
    .join(' ')
  return (
    <ChartFrame
      title="On-time performance"
      subtitle="Click a point for flights"
      legend={[
        { label: 'On-time % (within 15 min)', color: BI_COLORS.navy },
        { label: 'Target 85%', color: BI_COLORS.red },
      ]}
    >
      {values.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="bi-plot-scroll">
          <svg className="bi-plot" viewBox="0 0 480 236" role="group" aria-labelledby={titleId}>
            <title id={titleId}>On-time performance by {group}</title>
            <Axis
              ticks={ticks}
              y={y}
              format={(v) => `${Math.round(v * 100)}%`}
              unit="On-time %"
              labels={rows.map((row) => periodLabel(row.period, group))}
              xLabel={groupLabel(group)}
            />
            <line x1={52} x2={470} y1={y(0.85)} y2={y(0.85)} stroke={BI_COLORS.red} strokeDasharray="5 3" />
            <text x={232} y={y(0.85) - 6} style={{ fill: BI_COLORS.red }} className="bi-data-label">
              Target 85%
            </text>
            <path d={path} fill="none" stroke={BI_COLORS.navy} strokeWidth={2.5} strokeLinejoin="round" />
            {rows.map(
              (row, i) =>
                row.on_time_pct !== null && (
                  <g key={row.period}>
                    <circle cx={x(i)} cy={y(row.on_time_pct)} r={4} fill="white" stroke={BI_COLORS.navy} strokeWidth={2} />
                    {rows.length <= 14 && (
                      <text x={x(i)} y={y(row.on_time_pct) - 14} textAnchor="middle" className="bi-data-label">
                        {Math.round(row.on_time_pct * 100)}%
                      </text>
                    )}
                    <ChartHit
                      x={PLOT.left + (i * plotWidth) / rows.length}
                      y={22}
                      width={plotWidth / rows.length}
                      height={194}
                      detail={`${periodLabel(row.period, group)} · On-time: ${formatPercent(row.on_time_pct)}`}
                      description={`${formatCount(row.on_time_count)} of ${formatCount(row.departed_count)} departed flights left within 15 minutes. Target: 85%.`}
                      onPick={() => onPick(row.period)}
                    />
                  </g>
                ),
            )}
          </svg>
        </div>
      )}
    </ChartFrame>
  )
}

export function CabinChart({
  rows,
  previous,
  onPick,
}: {
  rows: BiCabinRow[]
  previous: BiCabinRow[]
  onPick: (cabin: string, label: string) => void
}) {
  const titleId = useId()
  const labels = ['First', 'Business', 'Premium Economy', 'Economy']
  const ordered = ['first', 'business', 'premium_economy', 'economy'].map((cabin) => rows.find((row) => row.cabin === cabin))
  const top = Math.max(1, ...rows.map((row) => row.load_factor ?? 0), ...previous.map((row) => row.load_factor ?? 0))
  const y = (value: number) => PLOT.bottom - (value / top) * plotHeight
  const ticks = Array.from({ length: 5 }, (_, i) => (top * i) / 4)
  return (
    <ChartFrame
      title="Load factor by cabin"
      subtitle="Click a bar for flights"
      legend={[
        { label: 'This period', color: BI_COLORS.navy },
        { label: 'Last period', color: BI_COLORS.gray },
      ]}
    >
      {rows.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="bi-plot-scroll">
          <svg className="bi-plot" viewBox="0 0 480 236" role="group" aria-labelledby={titleId}>
            <title id={titleId}>Seats sold by cabin, current and previous period</title>
            <Axis ticks={ticks} y={y} format={(v) => `${Math.round(v * 100)}%`} unit="Seats sold %" labels={labels} xLabel="Cabin" />
            {ordered.map((row, i) => {
              const before = previous.find((p) => p.cabin === row?.cabin)
              const center = PLOT.left + ((i + 0.5) * plotWidth) / 4
              return (
                <g key={labels[i]}>
                  {[row?.load_factor, before?.load_factor].map(
                    (value, j) =>
                      value != null && (
                        <g key={j}>
                          <rect
                            x={center - 40 + j * 40}
                            y={y(value)}
                            width={38}
                            height={PLOT.bottom - y(value)}
                            rx={2}
                            fill={j ? BI_COLORS.gray : BI_COLORS.navy}
                          />
                          <text x={center - 21 + j * 40} y={y(value) - 6} textAnchor="middle" className="bi-data-label">
                            {(value * 100).toFixed(1)}
                          </text>
                        </g>
                      ),
                  )}
                  {row && (
                    <ChartHit
                      x={PLOT.left + (i * plotWidth) / 4}
                      y={22}
                      width={plotWidth / 4}
                      height={194}
                      detail={`${row.label}: ${formatPercent(row.load_factor)}`}
                      description={`${formatCount(row.seat_sold)} of ${formatCount(row.seat_available)} seats sold. Last period: ${before ? formatPercent(before.load_factor) : 'No data'}.`}
                      onPick={() => onPick(row.cabin, row.label)}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </ChartFrame>
  )
}

export function PeriodBarChart({
  kind,
  rows,
  bookings,
  group,
  mode,
  onModeChange,
  onPick,
}: {
  kind: 'revenue' | 'bookings'
  rows: BiPeriodRow[]
  bookings: BiPeriodBookings[]
  group: BiGroup
  mode: BiRevenueMode
  onModeChange: (mode: BiRevenueMode) => void
  onPick: (period: string) => void
}) {
  const titleId = useId()
  const revenue = kind === 'revenue'
  const data = revenue
    ? rows.map((row) => ({ period: row.period, values: [row.revenue_per_seat] }))
    : bookings.map((row) => ({ period: row.period, values: [row.bookings, row.cancellations] }))
  const maximum = Math.max(0, ...data.flatMap((row) => row.values.filter((v): v is number => v !== null)))
  const minimum = Math.min(0, ...data.flatMap((row) => row.values.filter((value): value is number => value !== null)))
  const rough = (maximum - minimum || 1) / 3
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const residual = rough / magnitude
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude
  const low = Math.floor(minimum / step) * step
  const high = Math.ceil((maximum || (minimum === 0 ? 1 : 0)) / step) * step
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step)
  const y = (value: number) => PLOT.bottom - ((value - low) / (high - low)) * plotHeight
  const colors = revenue ? [BI_COLORS.blue] : [BI_COLORS.navy, BI_COLORS.yellow]
  const short = (value: number) => (Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : formatCount(value))
  return (
    <ChartFrame
      title={revenue ? 'Revenue per seat' : 'Bookings vs cancellations'}
      subtitle={revenue ? 'THB per available seat' : 'By booking date'}
      legend={
        revenue
          ? [{ label: 'Revenue per seat', color: BI_COLORS.blue }]
          : [
              { label: 'Bookings', color: BI_COLORS.navy },
              { label: 'Cancellations', color: BI_COLORS.yellow },
            ]
      }
      toolbar={
        revenue && (
          <div className="bi-segmented bi-revenue-toggle" role="group" aria-label="Revenue calculation">
            {(['after_refunds', 'before_refunds'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={mode === value} onClick={() => onModeChange(value)}>
                {value === 'after_refunds' ? 'After refunds' : 'Before refunds'}
              </button>
            ))}
          </div>
        )
      }
    >
      {data.length === 0 || !data.some((row) => row.values.some((value) => value !== null)) ? (
        <EmptyChart />
      ) : (
        <div className="bi-plot-scroll">
          <svg className="bi-plot" viewBox="0 0 480 236" role="group" aria-labelledby={titleId}>
            <title id={titleId}>
              {revenue ? 'Revenue per available seat' : 'Bookings and cancellations'} by {group}
            </title>
            <Axis
              ticks={ticks}
              y={y}
              format={(v) => (v === 0 ? '0' : `${revenue ? '฿' : ''}${short(v)}`)}
              unit={revenue ? 'THB' : 'Bookings'}
              labels={data.map((row) => periodLabel(row.period, group))}
              xLabel={groupLabel(group)}
            />
            {data.map((row, i) => {
              const groupWidth = plotWidth / data.length
              const width = Math.max(1, Math.min(revenue ? 46 : 32.44, (groupWidth * 0.8) / row.values.length))
              const center = PLOT.left + (i + 0.5) * groupWidth
              return (
                <g key={row.period}>
                  {row.values.map(
                    (value, j) =>
                      value !== null && (
                        <g key={j}>
                          <rect
                            x={center - (width * row.values.length) / 2 + j * (width + 1)}
                            y={y(Math.max(0, value))}
                            width={width}
                            height={Math.abs(y(0) - y(value))}
                            rx={2}
                            fill={colors[j]}
                          />
                          {data.length <= 14 && (
                            <text
                              x={center - (width * row.values.length) / 2 + j * (width + 1) + width / 2}
                              y={y(Math.max(0, value)) - 6}
                              textAnchor="middle"
                              className="bi-data-label"
                            >
                              {revenue ? '฿' : ''}
                              {short(value)}
                            </text>
                          )}
                        </g>
                      ),
                  )}
                  <ChartHit
                    x={PLOT.left + i * groupWidth}
                    y={22}
                    width={groupWidth}
                    height={194}
                    detail={`${periodLabel(row.period, group)} · ${revenue ? `Revenue per seat: ฿${formatMoney(row.values[0])}` : `Bookings: ${formatCount(row.values[0] ?? 0)} · Cancellations: ${formatCount(row.values[1] ?? 0)}`}`}
                    description={
                      revenue
                        ? `Revenue ${mode === 'after_refunds' ? 'after' : 'before'} refunds divided by available seats.`
                        : 'Bookings and cancellations grouped by booking date.'
                    }
                    onPick={() => onPick(row.period)}
                  />
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </ChartFrame>
  )
}
