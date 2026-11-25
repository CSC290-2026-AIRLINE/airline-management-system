import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { BI_COLORS } from '../chart-colors'
import { TOOLTIP } from '../lib-styles'
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
    <ChartFrame title={title} subtitle={subtitle} legend={legend}>
      <ol className="m-0 grid list-none gap-3 p-0">
        {rows.map((row, i) => (
          <Tooltip key={row.key}>
            <TooltipTrigger asChild>
              <li
                tabIndex={0}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-md text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:grid-cols-[1.5rem_6rem_minmax(0,1fr)_11rem]"
              >
                <span className="text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0">{row.label}</span>
                <span
                  aria-hidden="true"
                  className="col-span-full row-start-2 h-2 overflow-hidden rounded-full bg-muted md:col-span-1 md:row-start-auto"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: max > 0 && row.value !== null ? `${(row.value / max) * 100}%` : '0%',
                      background: row.alert ? BI_COLORS.red : BI_COLORS.navy,
                    }}
                  />
                </span>
                <span className="text-right whitespace-nowrap">
                  <strong>{row.value === null ? '—' : format(row.value)}</strong>{' '}
                  <small className="text-muted-foreground">{row.detail}</small>
                </span>
              </li>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8} className={TOOLTIP}>
              <strong>{row.label}</strong>
              <span>{row.value === null ? 'No figure' : `${format(row.value)} · ${row.detail}`}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </ol>
    </ChartFrame>
  )
}
