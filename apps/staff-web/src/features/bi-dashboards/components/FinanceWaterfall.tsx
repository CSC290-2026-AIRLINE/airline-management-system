import { formatCompact, formatMoney } from '../lib-format'
import { BI_COLORS } from '../chart-colors'
import { TooltipProvider } from '@staff-web/components/ui/tooltip'
import { niceTicks } from '../lib-chart'
import { EMPTY_TEXT } from '../lib-styles'
import { AXIS_TEXT, ChartHit, ChartPlot, DATA_LABEL } from './InteractiveCharts'

const HEIGHT = 286
const TOP = 22
const BOTTOM = 252

export interface WaterfallStep {
  label: string
  value: number
  total?: boolean
}

/** Vertical waterfall with independent signed ranges, including a loss below the zero line. */
export function FinanceWaterfall({ steps }: { steps: WaterfallStep[] }) {
  const bars = steps.reduce<(WaterfallStep & { from: number; to: number })[]>((result, step) => {
    const from = step.total ? 0 : (result.at(-1)?.to ?? 0)
    const to = step.total ? step.value : from + step.value
    return [...result, { ...step, from, to }]
  }, [])
  const low = Math.min(0, ...bars.flatMap((bar) => [bar.from, bar.to]))
  const high = Math.max(1, ...bars.flatMap((bar) => [bar.from, bar.to]))
  const ticks = niceTicks(low, high)
  const min = ticks[0]
  const max = ticks[ticks.length - 1]
  const short = (v: number) => `${v < 0 ? '−' : ''}${formatCompact(Math.abs(v))}`
  if (!steps.length) return <div className={EMPTY_TEXT}>No report data for this month.</div>
  // Nothing to draw: an empty axis would only repeat 0 down the side.
  if (steps.every((step) => step.value === 0)) return <div className={EMPTY_TEXT}>No revenue or costs recorded for this month.</div>
  return (
    <TooltipProvider delayDuration={80}>
      {/* Eight bars need about 60px each; below that the chart scrolls sideways instead of overlapping its labels. */}
      <ChartPlot label="From revenue to profit, THB" height={HEIGHT} minWidth={540}>
        {(chartWidth) => {
          const left = 52
          const right = chartWidth - 12
          const y = (value: number) => BOTTOM - ((value - min) / (max - min)) * (BOTTOM - TOP)
          const groupWidth = (right - left) / steps.length
          const width = Math.min(72, groupWidth * 0.65)
          // Long step names go on two lines when the bar's slot is narrower than the name.
          const twoLines = groupWidth < 110
          return (
            <>
              <g className={AXIS_TEXT}>
                <text x={0} y={10} className="font-medium">
                  THB
                </text>
                {ticks.map((tick) => (
                  <g key={tick}>
                    <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="stroke-line" />
                    <text x={left - 10} y={y(tick) + 4} textAnchor="end">
                      {tick === 0 ? '0' : short(tick)}
                    </text>
                  </g>
                ))}
              </g>
              {bars.map((bar, index) => {
                const x = left + (index + 0.5) * groupWidth - width / 2
                const barTop = y(Math.max(bar.from, bar.to))
                const height = Math.abs(y(bar.to) - y(bar.from))
                const color =
                  index === 0
                    ? BI_COLORS.navy
                    : bar.total
                      ? bar.value < 0
                        ? BI_COLORS.red
                        : BI_COLORS.green
                      : index < 3
                        ? '#8fa4ca'
                        : BI_COLORS.blue
                const lines = twoLines ? splitLabel(bar.label) : [bar.label]
                return (
                  <g key={bar.label}>
                    <rect x={x} y={barTop} width={width} height={Math.max(height, 1)} fill={color} />
                    <text x={x + width / 2} y={barTop - 6} textAnchor="middle" className={DATA_LABEL}>
                      {short(bar.value)}
                    </text>
                    {index < bars.length - 1 && (
                      <line x1={x + width} x2={x + groupWidth} y1={y(bar.to)} y2={y(bar.to)} stroke="#8fa4ca" strokeDasharray="3 2" />
                    )}
                    <text x={x + width / 2} y={BOTTOM + 18} textAnchor="middle" className={AXIS_TEXT}>
                      {lines.map((line, i) => (
                        <tspan key={line} x={x + width / 2} dy={i === 0 ? 0 : 13}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                    <ChartHit
                      x={left + index * groupWidth}
                      y={TOP}
                      width={groupWidth}
                      height={BOTTOM - TOP}
                      detail={`${bar.label}: ฿${formatMoney(bar.value)}`}
                      description={
                        bar.total ? 'Total for the selected report month.' : `Remaining after this deduction: ฿${formatMoney(bar.to)}.`
                      }
                    />
                  </g>
                )
              })}
            </>
          )
        }}
      </ChartPlot>
    </TooltipProvider>
  )
}

/** "Taxes & surcharges" as "Taxes &" over "surcharges": split at the space nearest the middle. */
function splitLabel(label: string): string[] {
  const spaces = [...label.matchAll(/ /g)].map((match) => match.index)
  if (spaces.length === 0) return [label]
  const middle = spaces.reduce((best, index) => (Math.abs(index - label.length / 2) < Math.abs(best - label.length / 2) ? index : best))
  return [label.slice(0, middle), label.slice(middle + 1)]
}
