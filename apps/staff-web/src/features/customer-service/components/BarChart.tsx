export interface Bar {
  label: string
  value: number
  /** Drawn in the accent colour, e.g. the latest week. */
  highlight?: boolean
}

interface BarChartProps {
  bars: Bar[]
  /** Top of the y-axis. */
  max: number
  /** Number of gridline gaps between 0 and `max`. */
  steps: number
  xLabel: string
  /** Draws a dashed reference line at this value. */
  average?: number
}

const PLOT_HEIGHT = 192

/** A small vertical bar chart with a labelled y-axis, drawn with plain elements so it needs no chart library. */
export function BarChart({ bars, max, steps, xLabel, average }: BarChartProps) {
  const ticks = Array.from({ length: steps + 1 }, (_, i) => Math.round((max * (steps - i)) / steps))
  const percent = (value: number) => `${(Math.min(value, max) / max) * 100}%`

  return (
    <div className="flex gap-2">
      <div className="relative w-7 shrink-0 text-right text-[11px] text-muted-foreground" style={{ height: PLOT_HEIGHT }}>
        {ticks.map((tick, i) => (
          <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / steps) * 100}%` }}>
            {tick}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative border-b border-muted-foreground/60" style={{ height: PLOT_HEIGHT }}>
          {ticks.slice(0, -1).map((_, i) => (
            <div key={i} className="absolute inset-x-0 border-t border-line" style={{ top: `${(i / steps) * 100}%` }} />
          ))}

          {average !== undefined && (
            <div className="absolute inset-x-0 z-10 border-t-2 border-dashed border-gold" style={{ bottom: percent(average) }}>
              <span className="absolute -top-5 left-2 text-[11px] font-medium text-warning">Average {average}</span>
            </div>
          )}

          <div className="absolute inset-0 flex items-end justify-around px-2">
            {bars.map((bar) => (
              <div key={bar.label} className="flex h-full flex-1 flex-col items-center justify-end">
                <span className="mb-1 text-xs font-semibold text-foreground">{bar.value}</span>
                <div
                  className={`w-full max-w-14 rounded-t-sm transition-[height] ${bar.highlight ? 'bg-gold' : 'bg-primary'}`}
                  style={{ height: bar.value > 0 ? `max(4px, ${percent(bar.value)})` : 0 }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-around px-2 pt-2">
          {bars.map((bar) => (
            <span key={bar.label} className="flex-1 text-center text-xs whitespace-nowrap text-muted-foreground">
              {bar.label}
            </span>
          ))}
        </div>
        <p className="mt-1 text-center text-[11px] font-semibold text-muted-foreground">{xLabel}</p>
      </div>
    </div>
  )
}
