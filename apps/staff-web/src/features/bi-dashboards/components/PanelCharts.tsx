import { niceTicks, plotArea } from '../lib-chart'
import { Axis, ChartFrame, ChartHit, ChartPlot, DATA_LABEL } from './InteractiveCharts'

/**
 * SVG charts for the no-show, extra-revenue and aircraft-use panels. They draw with the same axis, sizes and text as
 * the Operations charts. Hovering a bar group or a point shows the period and every series value, one per line.
 */

export interface BarSeries {
  name: string
  color: string
  values: number[]
}

function yScale(bottom: number, height: number, ticks: number[]) {
  const high = ticks[ticks.length - 1] || 1
  return (value: number) => bottom - (value / high) * height
}

export function BarPanelChart({
  title,
  subtitle,
  labels,
  series,
  stacked = false,
  format,
  detailFormat = format,
  unit,
  xLabel,
  onPick,
  labelTotals,
  totalsLabel,
}: {
  title: string
  subtitle?: string
  labels: string[]
  series: BarSeries[]
  stacked?: boolean
  /** Short figures for the axis and the labels above bars ("2.3K"). */
  format: (value: number) => string
  /** Exact figures for the hover tooltip ("2,304"). Defaults to `format`. */
  detailFormat?: (value: number) => string
  /** The axis caption above the y labels, as on the Operations charts. */
  unit: string
  xLabel: string
  onPick?: (index: number) => void
  /** Optional figure printed above each group, such as the booked total above a boarding-result stack. */
  labelTotals?: number[]
  /** What `labelTotals` is called in the tooltip; left out, the tooltip does not repeat it. */
  totalsLabel?: string
}) {
  const totals = labels.map((_, i) =>
    stacked ? series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0) : Math.max(0, ...series.map((s) => s.values[i] ?? 0)),
  )
  const ticks = niceTicks(0, Math.max(0, ...totals, ...(labelTotals ?? [])))
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={series.map((s) => ({ label: s.name, color: s.color }))}>
      <ChartPlot label={title}>
        {(width) => {
          const plot = plotArea(width)
          const y = yScale(plot.bottom, plot.height, ticks)
          const slot = labels.length ? plot.width / labels.length : plot.width
          const barWidth = Math.max(2, Math.min(46, slot * (stacked ? 0.6 : 0.8 / Math.max(1, series.length))))
          return (
            <>
              <Axis
                plot={plot}
                ticks={ticks}
                y={y}
                format={(v) => (v === 0 ? '0' : format(v))}
                unit={unit}
                labels={labels}
                xLabel={xLabel}
              />
              {labels.map((label, i) => {
                const x0 = plot.left + i * slot
                let base = 0
                const details = series.map((s) => `${s.name}: ${detailFormat(s.values[i] ?? 0)}`)
                if (labelTotals?.[i] !== undefined && totalsLabel) details.push(`${totalsLabel}: ${detailFormat(labelTotals[i])}`)
                else if (stacked && series.length > 1) details.push(`Total: ${detailFormat(totals[i])}`)
                return (
                  <g key={`${label}-${i}`}>
                    {series.map((s, si) => {
                      const value = s.values[i] ?? 0
                      const top = stacked ? base + value : value
                      const barX = stacked ? x0 + (slot - barWidth) / 2 : x0 + (slot - barWidth * series.length) / 2 + si * barWidth
                      const rect = (
                        <rect
                          key={s.name}
                          x={barX}
                          y={y(top)}
                          width={barWidth}
                          height={Math.max(0, y(stacked ? base : 0) - y(top))}
                          fill={s.color}
                        />
                      )
                      if (stacked) base += value
                      return rect
                    })}
                    {labelTotals?.[i] !== undefined && slot >= 36 && (
                      <text x={x0 + slot / 2} y={y(Math.max(labelTotals[i], totals[i])) - 6} textAnchor="middle" className={DATA_LABEL}>
                        {format(labelTotals[i])}
                      </text>
                    )}
                    <ChartHit
                      x={x0}
                      y={plot.top}
                      width={slot}
                      height={plot.height}
                      detail={label}
                      description={details}
                      onPick={onPick ? () => onPick(i) : undefined}
                    />
                  </g>
                )
              })}
            </>
          )
        }}
      </ChartPlot>
    </ChartFrame>
  )
}

export function LinePanelChart({
  title,
  subtitle,
  labels,
  values,
  color,
  format,
  unit,
  xLabel,
  valueLabel,
}: {
  title: string
  subtitle?: string
  labels: string[]
  values: (number | null)[]
  color: string
  format: (value: number) => string
  unit: string
  xLabel: string
  /** What the values measure, shown in the hover tooltip. Defaults to the chart title. */
  valueLabel?: string
}) {
  const present = values.filter((v): v is number => v !== null)
  const ticks = niceTicks(0, Math.max(0, ...present))
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={[{ label: valueLabel ?? title, color }]}>
      <ChartPlot label={title}>
        {(width) => {
          const plot = plotArea(width)
          const y = yScale(plot.bottom, plot.height, ticks)
          const slot = labels.length ? plot.width / labels.length : plot.width
          // Points sit at the centre of each period's slot, under their x label, as on the on-time chart.
          const x = (i: number) => plot.left + (i + 0.5) * slot
          const path = values.map((v, i) => (v === null ? '' : `${i > 0 && values[i - 1] !== null ? 'L' : 'M'}${x(i)} ${y(v)}`)).join(' ')
          return (
            <>
              <Axis
                plot={plot}
                ticks={ticks}
                y={y}
                format={(v) => (v === 0 ? '0' : format(v))}
                unit={unit}
                labels={labels}
                xLabel={xLabel}
              />
              {path && <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />}
              {values.map((v, i) =>
                v === null ? null : (
                  <g key={`${labels[i]}-${i}`}>
                    <circle cx={x(i)} cy={y(v)} r={4} fill="white" stroke={color} strokeWidth={2} />
                    {slot >= 40 && (
                      <text x={x(i)} y={y(v) - 10} textAnchor="middle" className={DATA_LABEL}>
                        {format(v)}
                      </text>
                    )}
                    <ChartHit
                      x={plot.left + i * slot}
                      y={plot.top}
                      width={slot}
                      height={plot.height}
                      detail={labels[i]}
                      description={`${valueLabel ?? title}: ${format(v)}`}
                    />
                  </g>
                ),
              )}
            </>
          )
        }}
      </ChartPlot>
    </ChartFrame>
  )
}
