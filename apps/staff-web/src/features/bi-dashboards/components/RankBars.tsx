import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { ChartFrame } from './InteractiveCharts'

export interface RankRow {
  key: string
  label: ReactNode
  /** The bar length as a fraction (0–1 for a rate); `null` draws an empty bar. */
  value: number | null
  /** Text shown after the value, such as "263 of 2,904". */
  detail: string
  /** Draw this row's bar in red (the alert colour), instead of navy. */
  alert?: boolean
}

/**
 * A ranked list of horizontal bars. Rows marked `alert` are red and the rest navy. Hovering a row shows its figures.
 * `legend` is optional and sits under the title, like the chart legends.
 */
export function RankBars({
  title,
  subtitle,
  rows,
  format,
  legend,
}: {
  title: string
  subtitle?: string
  rows: RankRow[]
  format: (value: number) => string
  legend?: { label: string; color: string }[]
}) {
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0))
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legend} wide>
      <ol className="bi-rank-list">
        {rows.map((row, i) => (
          <Tooltip key={row.key}>
            <TooltipTrigger asChild>
              <li tabIndex={0} className="bi-rank-row">
                <span className="bi-rank-index">{i + 1}.</span>
                <span className="bi-rank-label">{row.label}</span>
                <span className="bi-rank-track" aria-hidden="true">
                  <span
                    className="bi-rank-bar"
                    style={{
                      width: max > 0 && row.value !== null ? `${(row.value / max) * 100}%` : '0%',
                      background: row.alert ? '#d92d20' : '#102544',
                    }}
                  />
                </span>
                <span className="bi-rank-value">
                  <strong>{row.value === null ? '—' : format(row.value)}</strong> <small>{row.detail}</small>
                </span>
              </li>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8} className="bi-chart-tooltip">
              <strong>{row.label}</strong>
              <span>{row.value === null ? 'No figure' : `${format(row.value)} · ${row.detail}`}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </ol>
    </ChartFrame>
  )
}
