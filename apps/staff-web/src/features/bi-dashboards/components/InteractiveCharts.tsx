import { useId, type ReactNode } from 'react'
import { Card } from '@staff-web/components/ui/card'
import { cn } from '@staff-web/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@staff-web/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import type { BiCabinRow, BiPeriodBookings, BiPeriodRow, BiRevenueMode, BiGroup } from '../api/bi'
import { BI_COLORS } from '../chart-colors'
import { CHART_HEIGHT, groupLabel, labelEvery, niceTicks, plotArea, useChartWidth, type PlotArea } from '../lib-chart'
import { formatCompact, formatCount, formatMoney, formatPercent, periodLabel } from '../lib-format'
import { CARD, CARD_TITLE, EMPTY_TEXT, TOOLTIP } from '../lib-styles'

/** The box a chart sits in. Charts draw at its width, so it scrolls only below a chart's minimum width. */
export const PLOT_SCROLL = 'w-full min-w-0 overflow-x-auto print:overflow-visible'
/** Axis text and gridline labels; data labels sit above bars and points. */
export const AXIS_TEXT = 'fill-muted-foreground text-[11px]'
export const DATA_LABEL = 'fill-primary text-[10.5px] font-semibold'

export function ChartFrame({
  title,
  subtitle,
  legend,
  toolbar,
  children,
}: {
  title: string
  subtitle?: string
  legend?: { label: string; color: string }[]
  toolbar?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className={cn(CARD, 'overflow-hidden')}>
      <ChartHeading title={title} subtitle={subtitle} />
      {(legend || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {legend?.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-xs" style={{ background: item.color }} />
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

/** A card's title, with its note on the right (under it on a phone). */
export function ChartHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <h2 className={CARD_TITLE}>{title}</h2>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  )
}

/**
 * The SVG of a chart, drawn at the width of its card so the text stays 11px at every screen size. `children` gets
 * that width. Below `minWidth` the chart keeps its width and the box scrolls sideways; printed, it scales to the page.
 */
export function ChartPlot({
  label,
  height = CHART_HEIGHT,
  minWidth = 260,
  children,
}: {
  label: string
  height?: number
  minWidth?: number
  children: (width: number) => ReactNode
}) {
  const titleId = useId()
  const { ref, width } = useChartWidth(minWidth)
  return (
    <div ref={ref} className={PLOT_SCROLL}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width, height }}
        className="block max-w-none overflow-visible font-sans print:!h-auto print:!w-full"
        role="group"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{label}</title>
        {children(width)}
      </svg>
    </div>
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
  /** Lines under the bold first line; an array puts each figure on its own line. */
  description?: string | string[]
  onPick?: () => void
}) {
  const lines = description === undefined ? [] : Array.isArray(description) ? description : [description]
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
          aria-label={[detail, ...lines].join('. ')}
          className="cursor-pointer outline-none hover:fill-primary/5 focus-visible:fill-ring/10 focus-visible:stroke-ring print:hidden"
          onClick={onPick}
          onKeyDown={(event) => {
            if (onPick && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              onPick()
            }
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className={TOOLTIP}>
        <strong>{detail}</strong>
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
        {onPick && <span>Click to see the flights behind this figure.</span>}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The gridlines, y labels, x labels and axis captions shared by every BI line and bar chart. `unit` sits above the y
 * labels (never rotated); x labels sit under the centre of each period's slot and thin out when they would overlap.
 */
export function Axis({
  plot,
  ticks,
  y,
  format,
  unit,
  labels,
  xLabel,
  labelSpacing,
}: {
  plot: PlotArea
  ticks: number[]
  y: (v: number) => number
  format: (v: number) => string
  unit: string
  labels: string[]
  xLabel: string
  /** The room one x label needs, in pixels; the default suits dates. */
  labelSpacing?: number
}) {
  const every = labelEvery(labels.length, plot.width, labelSpacing)
  return (
    <g className={AXIS_TEXT}>
      <text x={0} y={10} className="font-medium">
        {unit}
      </text>
      {ticks.map((tick, index) => (
        <g key={tick}>
          <line
            x1={plot.left}
            x2={plot.right}
            y1={y(tick)}
            y2={y(tick)}
            className={index === 0 ? 'stroke-muted-foreground/50' : 'stroke-line'}
          />
          <text x={plot.left - 10} y={y(tick) + 4} textAnchor="end">
            {format(tick)}
          </text>
        </g>
      ))}
      {labels.map(
        (label, index) =>
          index % every === 0 && (
            <text key={`${label}-${index}`} x={plot.left + ((index + 0.5) * plot.width) / labels.length} y={215} textAnchor="middle">
              {label}
            </text>
          ),
      )}
      <text x={(plot.left + plot.right) / 2} y={232} textAnchor="middle" className="font-medium">
        {xLabel}
      </text>
    </g>
  )
}

export function EmptyChart() {
  return <div className={EMPTY_TEXT}>No data for this period.</div>
}

/** A y scale over `ticks` for the plot area. */
function scale(plot: PlotArea, ticks: number[]) {
  const low = ticks[0]
  const high = ticks[ticks.length - 1]
  return (value: number) => plot.bottom - ((value - low) / (high - low || 1)) * plot.height
}

export function OnTimeChart({ rows, group, onPick }: { rows: BiPeriodRow[]; group: BiGroup; onPick: (period: string) => void }) {
  const values = rows.flatMap((row) => (row.on_time_pct === null ? [] : [row.on_time_pct]))
  // Round steps (40/60/80/100%), starting at 60% or lower so the 85% target line always shows.
  const ticks = niceTicks(Math.min(0.6, ...values), Math.max(1, ...values))
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
        <ChartPlot label={`On-time performance by ${group}`}>
          {(width) => {
            const plot = plotArea(width)
            const y = scale(plot, ticks)
            const slot = plot.width / rows.length
            const x = (index: number) => plot.left + (index + 0.5) * slot
            const path = rows
              .map((row, index) =>
                row.on_time_pct === null
                  ? ''
                  : `${index > 0 && rows[index - 1].on_time_pct !== null ? 'L' : 'M'}${x(index)} ${y(row.on_time_pct)}`,
              )
              .join(' ')
            return (
              <>
                <Axis
                  plot={plot}
                  ticks={ticks}
                  y={y}
                  format={(v) => `${Math.round(v * 100)}%`}
                  unit="On-time %"
                  labels={rows.map((row) => periodLabel(row.period, group))}
                  xLabel={groupLabel(group)}
                />
                {/* The target is named in the legend, so no label sits on the line where it could cover a point. */}
                <line x1={plot.left} x2={plot.right} y1={y(0.85)} y2={y(0.85)} stroke={BI_COLORS.red} strokeDasharray="5 3" />
                <path d={path} fill="none" stroke={BI_COLORS.navy} strokeWidth={2.5} strokeLinejoin="round" />
                {rows.map(
                  (row, i) =>
                    row.on_time_pct !== null && (
                      <g key={row.period}>
                        <circle cx={x(i)} cy={y(row.on_time_pct)} r={4} fill="white" stroke={BI_COLORS.navy} strokeWidth={2} />
                        {slot >= 34 && (
                          <text x={x(i)} y={y(row.on_time_pct) - 10} textAnchor="middle" className={DATA_LABEL}>
                            {Math.round(row.on_time_pct * 100)}%
                          </text>
                        )}
                        <ChartHit
                          x={plot.left + i * slot}
                          y={plot.top}
                          width={slot}
                          height={plot.height}
                          detail={`${periodLabel(row.period, group)} · On-time: ${formatPercent(row.on_time_pct)}`}
                          description={`${formatCount(row.on_time_count)} of ${formatCount(row.departed_count)} departed flights left within 15 minutes. Target: 85%.`}
                          onPick={() => onPick(row.period)}
                        />
                      </g>
                    ),
                )}
              </>
            )
          }}
        </ChartPlot>
      )}
    </ChartFrame>
  )
}

const CABINS = [
  { cabin: 'first', label: 'First', short: 'First' },
  { cabin: 'business', label: 'Business', short: 'Business' },
  { cabin: 'premium_economy', label: 'Premium Economy', short: 'Premium' },
  { cabin: 'economy', label: 'Economy', short: 'Economy' },
]

export function CabinChart({
  rows,
  previous,
  onPick,
}: {
  rows: BiCabinRow[]
  previous: BiCabinRow[]
  onPick: (cabin: string, label: string) => void
}) {
  const hasPrevious = previous.some((row) => row.load_factor !== null)
  const top = Math.max(1, ...rows.map((row) => row.load_factor ?? 0), ...previous.map((row) => row.load_factor ?? 0))
  const ticks = niceTicks(0, top, 5)
  return (
    <ChartFrame
      title="Load factor by cabin"
      subtitle="Click a bar for flights"
      legend={[
        { label: 'This period', color: BI_COLORS.navy },
        // The previous-period bars are drawn only when there is a previous period, so the legend says so too.
        ...(hasPrevious ? [{ label: 'Last period', color: BI_COLORS.gray }] : []),
      ]}
    >
      {rows.length === 0 ? (
        <EmptyChart />
      ) : (
        <ChartPlot label="Seats sold by cabin, current and previous period">
          {(width) => {
            const plot = plotArea(width)
            const y = scale(plot, ticks)
            const slot = plot.width / CABINS.length
            const barWidth = Math.min(38, slot * (hasPrevious ? 0.36 : 0.5))
            const labels = CABINS.map((c) => (slot < 100 ? c.short : c.label))
            return (
              <>
                <Axis
                  plot={plot}
                  ticks={ticks}
                  y={y}
                  format={(v) => `${Math.round(v * 100)}%`}
                  unit="Seats sold %"
                  labels={labels}
                  xLabel="Cabin"
                  labelSpacing={44}
                />
                {CABINS.map((cabin, i) => {
                  const row = rows.find((r) => r.cabin === cabin.cabin)
                  const before = previous.find((p) => p.cabin === cabin.cabin)
                  const center = plot.left + (i + 0.5) * slot
                  // With a previous period the pair straddles the label; alone, the bar sits right under it.
                  const bars = hasPrevious
                    ? [
                        { value: row?.load_factor, x: center - barWidth - 1, color: BI_COLORS.navy },
                        { value: before?.load_factor, x: center + 1, color: BI_COLORS.gray },
                      ]
                    : [{ value: row?.load_factor, x: center - barWidth / 2, color: BI_COLORS.navy }]
                  return (
                    <g key={cabin.cabin}>
                      {bars.map(
                        (bar, j) =>
                          bar.value != null && (
                            <g key={j}>
                              <rect
                                x={bar.x}
                                y={y(bar.value)}
                                width={barWidth}
                                height={plot.bottom - y(bar.value)}
                                rx={2}
                                fill={bar.color}
                              />
                              {barWidth >= 22 && (
                                <text x={bar.x + barWidth / 2} y={y(bar.value) - 6} textAnchor="middle" className={DATA_LABEL}>
                                  {(bar.value * 100).toFixed(1)}
                                </text>
                              )}
                            </g>
                          ),
                      )}
                      {row && (
                        <ChartHit
                          x={plot.left + i * slot}
                          y={plot.top}
                          width={slot}
                          height={plot.height}
                          detail={`${row.label}: ${formatPercent(row.load_factor)}`}
                          description={[
                            `${formatCount(row.seat_sold)} of ${formatCount(row.seat_available)} seats sold.`,
                            `Last period: ${before ? formatPercent(before.load_factor) : 'No data'}.`,
                          ]}
                          onPick={() => onPick(row.cabin, row.label)}
                        />
                      )}
                    </g>
                  )
                })}
              </>
            )
          }}
        </ChartPlot>
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
  const revenue = kind === 'revenue'
  const data = revenue
    ? rows.map((row) => ({ period: row.period, values: [row.revenue_per_seat] }))
    : bookings.map((row) => ({ period: row.period, values: [row.bookings, row.cancellations] }))
  const present = data.flatMap((row) => row.values.filter((v): v is number => v !== null))
  const ticks = niceTicks(Math.min(0, ...present), Math.max(0, ...present), 3)
  const colors = revenue ? [BI_COLORS.blue] : [BI_COLORS.navy, BI_COLORS.yellow]
  const short = (value: number) => `${revenue ? '฿' : ''}${formatCompact(value)}`
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
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Revenue calculation"
            value={mode}
            onValueChange={(value) => value && onModeChange(value as BiRevenueMode)}
          >
            {(['after_refunds', 'before_refunds'] as const).map((value) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {value === 'after_refunds' ? 'After refunds' : 'Before refunds'}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )
      }
    >
      {present.length === 0 ? (
        <EmptyChart />
      ) : (
        <ChartPlot label={`${revenue ? 'Revenue per available seat' : 'Bookings and cancellations'} by ${group}`}>
          {(width) => {
            const plot = plotArea(width)
            const y = scale(plot, ticks)
            const groupWidth = plot.width / data.length
            return (
              <>
                <Axis
                  plot={plot}
                  ticks={ticks}
                  y={y}
                  format={(v) => (v === 0 ? '0' : short(v))}
                  unit={revenue ? 'THB' : 'Bookings'}
                  labels={data.map((row) => periodLabel(row.period, group))}
                  xLabel={groupLabel(group)}
                />
                {data.map((row, i) => {
                  const barWidth = Math.max(1, Math.min(revenue ? 46 : 32, (groupWidth * 0.8) / row.values.length))
                  const center = plot.left + (i + 0.5) * groupWidth
                  // A label per bar only when each bar has room for "฿1.2K".
                  const showLabels = groupWidth / row.values.length >= 30
                  return (
                    <g key={row.period}>
                      {row.values.map((value, j) => {
                        if (value === null) return null
                        const barX = center - (barWidth * row.values.length) / 2 + j * (barWidth + 1)
                        return (
                          <g key={j}>
                            <rect
                              x={barX}
                              y={y(Math.max(0, value))}
                              width={barWidth}
                              height={Math.abs(y(0) - y(value))}
                              rx={2}
                              fill={colors[j]}
                            />
                            {showLabels && (
                              <text x={barX + barWidth / 2} y={y(Math.max(0, value)) - 6} textAnchor="middle" className={DATA_LABEL}>
                                {short(value)}
                              </text>
                            )}
                          </g>
                        )
                      })}
                      <ChartHit
                        x={plot.left + i * groupWidth}
                        y={plot.top}
                        width={groupWidth}
                        height={plot.height}
                        detail={periodLabel(row.period, group)}
                        description={
                          revenue
                            ? [
                                `Revenue per seat: ฿${formatMoney(row.values[0])}`,
                                `Revenue ${mode === 'after_refunds' ? 'after' : 'before'} refunds divided by available seats.`,
                              ]
                            : [`Bookings: ${formatCount(row.values[0] ?? 0)}`, `Cancellations: ${formatCount(row.values[1] ?? 0)}`]
                        }
                        onPick={() => onPick(row.period)}
                      />
                    </g>
                  )
                })}
              </>
            )
          }}
        </ChartPlot>
      )}
    </ChartFrame>
  )
}
