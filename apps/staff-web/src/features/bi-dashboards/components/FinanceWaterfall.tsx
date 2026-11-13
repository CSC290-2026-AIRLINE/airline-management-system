import { useId } from 'react'
import { formatMoney } from '../lib-format'
import { ChartHit } from './InteractiveCharts'
import { BI_COLORS } from '../chart-colors'
import { TooltipProvider } from '@staff-web/components/ui/tooltip'

export interface WaterfallStep {
  label: string
  value: number
  total?: boolean
}

/** Vertical waterfall with independent signed ranges, including a loss below the zero line. */
export function FinanceWaterfall({ steps }: { steps: WaterfallStep[] }) {
  const titleId = useId()
  const bars = steps.reduce<(WaterfallStep & { from: number; to: number })[]>((result, step) => {
    const from = step.total ? 0 : (result.at(-1)?.to ?? 0)
    const to = step.total ? step.value : from + step.value
    return [...result, { ...step, from, to }]
  }, [])
  const low = Math.min(0, ...bars.flatMap((bar) => [bar.from, bar.to]))
  const high = Math.max(1, ...bars.flatMap((bar) => [bar.from, bar.to]))
  const rough = (high - low) / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = Math.ceil(rough / magnitude) * magnitude
  const min = Math.floor(low / step) * step
  const max = Math.ceil(high / step) * step
  const left = 52,
    right = 1006,
    top = 22,
    bottom = 252
  const y = (value: number) => bottom - ((value - min) / (max - min)) * (bottom - top)
  const groupWidth = (right - left) / Math.max(steps.length, 1)
  const width = Math.min(72, groupWidth * 0.65)
  const short = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v / 1_000_000).toFixed(1)}M`
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, index) => min + index * step)
  if (!steps.length) return <div className="bi-chart-empty">No report data for this month.</div>
  return (
    <TooltipProvider delayDuration={80}>
      <div className="bi-plot-scroll">
        <svg className="bi-waterfall-plot" viewBox="0 0 1017 286" role="group" aria-labelledby={titleId}>
          <title id={titleId}>From revenue to profit, THB</title>
          <g className="bi-chart-axis">
            <text x={0} y={10} className="bi-axis-title">
              THB
            </text>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="#e6e9ef" />
                <text x={left - 10} y={y(tick) + 4} textAnchor="end">
                  {tick === 0 ? '0' : `${Math.round(tick / 1_000_000)}M`}
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
            return (
              <g key={bar.label}>
                <rect x={x} y={barTop} width={width} height={Math.max(height, 1)} fill={color} />
                <text x={x + width / 2} y={barTop - 6} textAnchor="middle" className="bi-data-label">
                  {short(bar.value)}
                </text>
                {index < bars.length - 1 && (
                  <line x1={x + width} x2={x + groupWidth} y1={y(bar.to)} y2={y(bar.to)} stroke="#8fa4ca" strokeDasharray="3 2" />
                )}
                <text x={x + width / 2} y={270} textAnchor="middle" className="bi-chart-axis">
                  {bar.label}
                </text>
                <ChartHit
                  x={left + index * groupWidth}
                  y={top}
                  width={groupWidth}
                  height={bottom - top}
                  detail={`${bar.label}: ฿${formatMoney(bar.value)}`}
                  description={
                    bar.total ? 'Total for the selected report month.' : `Remaining after this deduction: ฿${formatMoney(bar.to)}.`
                  }
                />
              </g>
            )
          })}
        </svg>
      </div>
    </TooltipProvider>
  )
}
