import { AXIS_TEXT, ChartFrame, ChartHit, DATA_LABEL, PLOT_SCROLL } from './InteractiveCharts'

/**
 * SVG charts for the no-show, extra-revenue and aircraft-use panels. Hovering a bar group or a point shows the same
 * tooltip as the Operations charts (ChartHit): the period, and every series value.
 */

const WIDTH = 640
const HEIGHT = 260
const PAD = { top: 16, right: 16, bottom: 36, left: 56 }

/** A round axis maximum at or above `value`, so the top gridline never clips a bar. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10
  return step * magnitude
}

function labelEvery(count: number): number {
  return count > 12 ? Math.ceil(count / 12) : 1
}

export interface BarSeries {
  name: string
  color: string
  values: number[]
}

export function BarPanelChart({
  title,
  subtitle,
  labels,
  series,
  stacked = false,
  format,
  yTitle,
  onPick,
  labelTotals,
}: {
  title: string
  subtitle?: string
  labels: string[]
  series: BarSeries[]
  stacked?: boolean
  format: (value: number) => string
  yTitle?: string
  onPick?: (index: number) => void
  /** Optional figure printed above each group, such as the booked total above a boarding-result stack. */
  labelTotals?: number[]
}) {
  const totals = labels.map((_, i) =>
    stacked ? series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0) : Math.max(0, ...series.map((s) => s.values[i] ?? 0)),
  )
  const max = niceMax(Math.max(0, ...totals, ...(labelTotals ?? [])))
  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const slot = labels.length ? plotWidth / labels.length : plotWidth
  const barWidth = Math.max(4, slot * (stacked ? 0.6 : 0.8 / Math.max(1, series.length)))
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight
  const every = labelEvery(labels.length)
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={series.map((s) => ({ label: s.name, color: s.color }))}>
      <div className={PLOT_SCROLL}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={title}
          className="block w-full min-w-[480px] font-sans print:min-w-0"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max * t)} y2={y(max * t)} className="stroke-line" />
              <text x={PAD.left - 8} y={y(max * t) + 4} textAnchor="end" className={AXIS_TEXT}>
                {format(max * t)}
              </text>
            </g>
          ))}
          {yTitle && (
            <text x={12} y={PAD.top + plotHeight / 2} className={AXIS_TEXT} transform={`rotate(-90 12 ${PAD.top + plotHeight / 2})`}>
              {yTitle}
            </text>
          )}
          {labels.map((label, i) => {
            const x0 = PAD.left + i * slot
            let base = 0
            const details = series.map((s) => `${s.name}: ${format(s.values[i] ?? 0)}`)
            if (stacked) details.push(`Total: ${format(totals[i])}`)
            if (labelTotals?.[i] !== undefined) details.push(`Booked: ${format(labelTotals[i])}`)
            return (
              <g key={`${label}-${i}`} onClick={onPick ? () => onPick(i) : undefined} style={onPick ? { cursor: 'pointer' } : undefined}>
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
                {labelTotals?.[i] !== undefined && (
                  <text x={x0 + slot / 2} y={y(labelTotals[i]) - 6} textAnchor="middle" className={DATA_LABEL}>
                    {format(labelTotals[i])}
                  </text>
                )}
                {i % every === 0 && (
                  <text x={x0 + slot / 2} y={HEIGHT - 12} textAnchor="middle" className={AXIS_TEXT}>
                    {label}
                  </text>
                )}
                <ChartHit
                  x={x0}
                  y={PAD.top}
                  width={slot}
                  height={plotHeight}
                  detail={label}
                  description={details.join(' · ')}
                  onPick={onPick ? () => onPick(i) : undefined}
                />
              </g>
            )
          })}
        </svg>
      </div>
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
  yTitle,
  valueLabel,
}: {
  title: string
  subtitle?: string
  labels: string[]
  values: (number | null)[]
  color: string
  format: (value: number) => string
  yTitle?: string
  /** What the values measure, shown in the hover tooltip. Defaults to the chart title. */
  valueLabel?: string
}) {
  const present = values.filter((v): v is number => v !== null)
  const max = niceMax(Math.max(0, ...present))
  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const step = labels.length > 1 ? plotWidth / (labels.length - 1) : 0
  const x = (i: number) => PAD.left + (labels.length > 1 ? i * step : plotWidth / 2)
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight
  const hitWidth = labels.length > 1 ? step : plotWidth
  const path = values
    .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
    .filter((p): p is string => p !== null)
    .join(' ')
  const every = labelEvery(labels.length)
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={[{ label: title, color }]}>
      <div className={PLOT_SCROLL}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={title}
          className="block w-full min-w-[480px] font-sans print:min-w-0"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(max * t)} y2={y(max * t)} className="stroke-line" />
              <text x={PAD.left - 8} y={y(max * t) + 4} textAnchor="end" className={AXIS_TEXT}>
                {format(max * t)}
              </text>
            </g>
          ))}
          {yTitle && (
            <text x={12} y={PAD.top + plotHeight / 2} className={AXIS_TEXT} transform={`rotate(-90 12 ${PAD.top + plotHeight / 2})`}>
              {yTitle}
            </text>
          )}
          {path && <polyline points={path} fill="none" stroke={color} strokeWidth={2} />}
          {values.map((v, i) =>
            v === null ? null : (
              <g key={labels[i]}>
                <circle cx={x(i)} cy={y(v)} r={3.5} fill={color} />
                <text x={x(i)} y={y(v) - 8} textAnchor="middle" className={DATA_LABEL}>
                  {format(v)}
                </text>
                <ChartHit
                  x={x(i) - hitWidth / 2}
                  y={PAD.top}
                  width={hitWidth}
                  height={plotHeight}
                  detail={labels[i]}
                  description={`${valueLabel ?? title}: ${format(v)}`}
                />
              </g>
            ),
          )}
          {labels.map((label, i) =>
            i % every === 0 ? (
              <text key={`${label}-${i}`} x={x(i)} y={HEIGHT - 12} textAnchor="middle" className={AXIS_TEXT}>
                {label}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </ChartFrame>
  )
}
