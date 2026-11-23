import { formatDayMonth } from './format'
import type { DailySessionPoint } from './types'

/** The chart plots 0 – 60 sessions over 192px, so one session is 3.2px tall. */
const UNIT_HEIGHT = 3.2
const BASELINE = 200
const PLOT_LEFT = 52
const PLOT_WIDTH = 922
const PLOT_RIGHT = PLOT_LEFT + PLOT_WIDTH
const FIRST_BAR_LEFT = 58
const BAR_WIDTH = 18
const GRIDLINES = [0, 15, 30, 45, 60]

/**
 * Bar x-offsets inside the 978px chart, exactly as the design lays them out (Figma node 6:220 – 6:249).
 * Reproduced verbatim rather than recomputed so the default 30-day view matches pixel for pixel.
 */
const BAR_OFFSETS = [
  58, 89, 120, 151, 181, 212, 243, 274, 304, 335, 366, 396, 427, 458, 489, 519, 550, 581, 612, 642, 673, 704, 735, 765, 796, 827, 857, 888,
  919, 950,
]

/** Bar x-offsets: the design's own offsets for the 30-day view, an even spread otherwise. */
function barOffset(index: number, count: number): number {
  if (count === BAR_OFFSETS.length) {
    return BAR_OFFSETS[index]
  }
  if (count <= 1) {
    return FIRST_BAR_LEFT
  }
  return FIRST_BAR_LEFT + (index * (PLOT_RIGHT - BAR_WIDTH - FIRST_BAR_LEFT)) / (count - 1)
}

/** The days labelled under the axis. The design labels every fifth day plus the last one. */
function labelledIndexes(count: number): number[] {
  if (count <= 8) {
    return Array.from({ length: count }, (_, index) => index)
  }
  const indexes: number[] = []
  for (let index = 0; index < count; index += 5) {
    indexes.push(index)
  }
  if (indexes[indexes.length - 1] !== count - 1) {
    indexes.push(count - 1)
  }
  return indexes
}

interface SessionsChartProps {
  /** One point per day in the window, oldest first. */
  points: DailySessionPoint[]
  /** Text shown at the right of the card header, e.g. "Last 30 days". */
  summary: string
}

/**
 * "Sessions per day" bar chart (Figma node 4:209). The chart is drawn with absolute positioning because every
 * bar, gridline and label has a fixed place in the design.
 */
export function SessionsChart({ points, summary }: SessionsChartProps) {
  const labelled = labelledIndexes(points.length)
  const lastLabel = points.length > 0 ? formatDayMonth(points[points.length - 1].date) : ''

  return (
    <section className="ra-card">
      <header className="ra-cardHeader">
        <h2 className="ra-cardTitle">Sessions per day</h2>
        <p className="ra-cardSummary">{summary}</p>
      </header>

      <div className="ra-chart" role="img" aria-label={`Sessions per day, ${points.length} days`}>
        {GRIDLINES.map((value) => (
          <div
            key={value}
            className={`ra-gridline${value === 0 ? ' ra-gridline--baseline' : ''}`}
            style={{ top: BASELINE - value * UNIT_HEIGHT }}
          >
            <span className="ra-yLabel">{value}</span>
          </div>
        ))}

        {points.map((point, index) => {
          const height = Math.round(point.sessions * UNIT_HEIGHT)
          const isToday = index === points.length - 1
          return (
            <div
              key={point.date}
              className={`ra-bar${isToday ? ' ra-bar--today' : ''}`}
              style={{ left: barOffset(index, points.length), top: BASELINE - height, height }}
              title={`${formatDayMonth(point.date)}: ${point.sessions} sessions`}
            />
          )
        })}

        {labelled.map((index) => (
          <p key={points[index].date} className="ra-xLabel" style={{ left: barOffset(index, points.length) + BAR_WIDTH / 2 }}>
            {formatDayMonth(points[index].date)}
          </p>
        ))}
      </div>

      <div className="ra-legend">
        <span className="ra-legendItem">
          <span className="ra-legendSwatch ra-legendSwatch--daily" aria-hidden="true" />
          Daily sessions
        </span>
        <span className="ra-legendItem">
          <span className="ra-legendSwatch ra-legendSwatch--today" aria-hidden="true" />
          Today · {lastLabel}
        </span>
      </div>
    </section>
  )
}
