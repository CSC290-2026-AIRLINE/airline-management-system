/**
 * Pure SVG chart rendering. No I/O and no chart library.
 *
 * The data colours come from the dataviz reference palette, checked with its validator: a small set of hues that stay
 * apart for colour-blind readers, on a white card. Each chart is a card with a title, a subtitle, a headline figure and,
 * for two or more series, a legend. It also has a <title>/<desc> pair so screen readers get the same summary as the
 * picture. Colour is never the only signal: series are named in the legend, and values are printed where they fit.
 */

export const PALETTE = {
  ink: '#0b0b0b',
  secondary: '#52514e',
  navy: '#14213d',
  grid: '#e8eaf0',
  border: '#d9dfe9',
  card: '#ffffff',
  track: '#f1f3f7',
  blue: '#2a78d6',
  orange: '#eb6834',
  aqua: '#1baf7a',
  yellow: '#eda100',
  violet: '#6250d6',
  red: '#e34948',
} as const

const WIDTH = 720
const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const HEADING = "Merriweather, Georgia, 'Times New Roman', serif"
const TICK_COUNT = 4
const MAX_X_LABELS = 8
const MAX_VALUE_LABELS = 14

/** The plot area of the axis charts (area and column). */
const AXIS = { left: 74, right: WIDTH - 40, top: 128, bottom: 300, height: 340 }

export interface Headline {
  value: string
  caption: string
}

export interface CardSpec {
  title: string
  subtitle: string
  headline?: Headline
}

export interface Series {
  name: string
  color: string
  /** One value per label. `null` means no data for that label: the line breaks and the column is left out. */
  points: (number | null)[]
}

export interface AxisChartSpec extends CardSpec {
  labels: string[]
  series: Series[]
  format: (value: number) => string
}

export interface AreaChartSpec extends AxisChartSpec {
  /** Fill the area under the line. Off for a plain line with markers. */
  area: boolean
}

export interface ColumnChartSpec extends AxisChartSpec {
  /** Print each column's value above it, where there is room. */
  showValues: boolean
}

export interface RankedBar {
  label: string
  value: number
  /** Printed at the right of the row, for example "1,250 min · 12 delays". */
  detail: string
}

export interface RankedBarSpec extends CardSpec {
  bars: RankedBar[]
  color: string
}

export interface MeterRow {
  label: string
  /** 0 to 1, or null when there is nothing to measure. */
  fraction: number | null
  color: string
  detail: string
}

export interface MeterSpec extends CardSpec {
  rows: MeterRow[]
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function renderAreaChart(spec: AreaChartSpec): string {
  const values = spec.series.flatMap((s) => s.points).filter(isNumber)
  if (values.length === 0 || spec.labels.length === 0) {
    return frame(spec, AXIS.height, emptyBody(AXIS.height), spec.series)
  }

  const { ticks, yOf, xOf } = axes(spec, values)
  const body =
    gridAndLabels(spec, ticks, yOf, xOf) +
    spec.series
      .map((series) => {
        const runs = segments(series.points)
        const areas = spec.area
          ? runs
              .map((run) => {
                const top = run.map((i) => `L${xOf(i)} ${yOf(series.points[i] as number)}`).join(' ')
                const first = run[0]
                const last = run[run.length - 1]
                return `<path d="M${xOf(first)} ${AXIS.bottom} ${top} L${xOf(last)} ${AXIS.bottom} Z" fill="${series.color}" fill-opacity="0.16"/>`
              })
              .join('')
          : ''
        const lines = runs
          .map((run) => {
            const d = run.map((i, k) => `${k === 0 ? 'M' : 'L'}${xOf(i)} ${yOf(series.points[i] as number)}`).join(' ')
            return `<path d="${d}" fill="none" stroke="${series.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
          })
          .join('')
        const dots = series.points
          .map((v, i) =>
            v === null
              ? ''
              : `<circle cx="${xOf(i)}" cy="${yOf(v)}" r="3" fill="${PALETTE.card}" stroke="${series.color}" stroke-width="2"/>`,
          )
          .join('')
        return areas + lines + dots + latestLabel(series, spec, xOf, yOf)
      })
      .join('')

  return frame(spec, AXIS.height, body, spec.series)
}

export function renderColumnChart(spec: ColumnChartSpec): string {
  const values = spec.series.flatMap((s) => s.points).filter(isNumber)
  if (values.length === 0 || spec.labels.length === 0) {
    return frame(spec, AXIS.height, emptyBody(AXIS.height), spec.series)
  }

  const { ticks, yOf } = axes(spec, values)
  const groupWidth = (AXIS.right - AXIS.left) / spec.labels.length
  const n = spec.series.length
  const barWidth = Math.min(36, (groupWidth * 0.7 - (n - 1) * 2) / n)
  const showValues = spec.showValues && spec.labels.length <= MAX_VALUE_LABELS
  const xLabelEvery = Math.ceil(spec.labels.length / MAX_X_LABELS)

  const bars = spec.labels
    .map((_, i) => {
      const groupCentre = AXIS.left + (i + 0.5) * groupWidth
      const totalWidth = n * barWidth + (n - 1) * 2
      return spec.series
        .map((series, k) => {
          const v = series.points[i]
          if (v === null || v <= 0) return ''
          const x = groupCentre - totalWidth / 2 + k * (barWidth + 2)
          const y = yOf(v)
          const h = AXIS.bottom - y
          const label = showValues
            ? `<text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(spec.format(v))}</text>`
            : ''
          return `<path d="${roundedTopBar(x, y, barWidth, h)}" fill="${series.color}"/>${label}`
        })
        .join('')
    })
    .join('')

  const xLabels = spec.labels
    .map((label, i) =>
      i % xLabelEvery === 0
        ? `<text x="${AXIS.left + (i + 0.5) * groupWidth}" y="${AXIS.bottom + 20}" text-anchor="middle" font-size="11" fill="${PALETTE.secondary}" font-family="${SANS}">${escapeXml(label)}</text>`
        : '',
    )
    .join('')

  return frame(spec, AXIS.height, gridLines(ticks, yOf, spec.format) + xLabels + bars, spec.series)
}

/** Ranked horizontal bars: one hue, largest first, each row with its own detail text. */
export function renderRankedBars(spec: RankedBarSpec): string {
  const rowHeight = 38
  const top = 120
  const labelWidth = 170
  const barLeft = 24 + labelWidth
  const barRight = WIDTH - 230
  const height = Math.max(200, top + spec.bars.length * rowHeight + 20)

  if (spec.bars.length === 0) {
    return frame(spec, height, emptyBody(height))
  }

  const max = Math.max(...spec.bars.map((b) => b.value), 0) || 1
  const rows = spec.bars
    .map((bar, i) => {
      const y = top + i * rowHeight
      const width = Math.max(0, (bar.value / max) * (barRight - barLeft))
      return (
        `<text x="24" y="${y + 19}" font-size="13" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(bar.label)}</text>` +
        `<rect x="${barLeft}" y="${y + 6}" width="${barRight - barLeft}" height="16" rx="5" fill="${PALETTE.track}"/>` +
        `<rect x="${barLeft}" y="${y + 6}" width="${width}" height="16" rx="5" fill="${spec.color}"/>` +
        `<text x="${WIDTH - 24}" y="${y + 19}" text-anchor="end" font-size="12" font-weight="600" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(bar.detail)}</text>`
      )
    })
    .join('')

  return frame(spec, height, rows)
}

/** One row per category: a track showing a share from 0 to 100%, filled in the category's colour. */
export function renderMeter(spec: MeterSpec): string {
  const rowHeight = 46
  const top = 120
  const labelWidth = 170
  const barLeft = 24 + labelWidth
  const barRight = WIDTH - 230
  const height = Math.max(200, top + spec.rows.length * rowHeight + 20)

  if (spec.rows.length === 0) {
    return frame(spec, height, emptyBody(height))
  }

  const rows = spec.rows
    .map((row, i) => {
      const y = top + i * rowHeight
      const label = `<text x="24" y="${y + 19}" font-size="13" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(row.label)}</text>`
      if (row.fraction === null) {
        return (
          label +
          `<text x="${barLeft}" y="${y + 19}" font-size="12" fill="${PALETTE.secondary}" font-family="${SANS}">No departed flights</text>`
        )
      }
      const fraction = Math.min(1, Math.max(0, row.fraction))
      const detail =
        `<text x="${WIDTH - 24}" y="${y + 19}" text-anchor="end" font-size="12" fill="${PALETTE.secondary}" font-family="${SANS}">` +
        `<tspan font-weight="700" fill="${PALETTE.ink}">${escapeXml(formatPercent(row.fraction))}</tspan> · ${escapeXml(row.detail)}</text>`
      return (
        label +
        `<rect x="${barLeft}" y="${y + 8}" width="${barRight - barLeft}" height="14" rx="7" fill="${PALETTE.track}"/>` +
        `<rect x="${barLeft}" y="${y + 8}" width="${(barRight - barLeft) * fraction}" height="14" rx="7" fill="${row.color}"/>` +
        detail
      )
    })
    .join('')

  return frame(spec, height, rows)
}

/** Wraps the body in a card: title, subtitle, headline figure and legend, with an accessible name and description. */
function frame(card: CardSpec, height: number, body: string, series: Series[] = []): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="chart-title chart-desc">` +
    `<title id="chart-title">${escapeXml(card.title)}</title>` +
    `<desc id="chart-desc">${escapeXml(card.subtitle)}</desc>` +
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="14" fill="${PALETTE.card}" stroke="${PALETTE.border}"/>` +
    `<text x="24" y="38" font-size="18" font-weight="700" fill="${PALETTE.navy}" font-family="${HEADING}">${escapeXml(card.title)}</text>` +
    `<text x="24" y="60" font-size="13" fill="${PALETTE.secondary}" font-family="${SANS}">${escapeXml(card.subtitle)}</text>` +
    `<line x1="24" x2="${WIDTH - 24}" y1="74" y2="74" stroke="${PALETTE.grid}"/>` +
    legend(series) +
    headline(card.headline) +
    body +
    `</svg>`
  )
}

/** Series names with a colour swatch. Only shown for two or more series, so one-series cards stay quiet. */
function legend(series: Series[]): string {
  if (series.length < 2) return ''
  let x = 24
  return series
    .map((s) => {
      const item =
        `<rect x="${x}" y="90" width="12" height="12" rx="3" fill="${s.color}"/>` +
        `<text x="${x + 18}" y="101" font-size="12" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(s.name)}</text>`
      x += 30 + s.name.length * 7
      return item
    })
    .join('')
}

/** The headline figure sits on the legend row, on the right, so it never collides with the title or the subtitle. */
function headline(figure: Headline | undefined): string {
  if (!figure) return ''
  return (
    `<text x="${WIDTH - 24}" y="101" text-anchor="end" font-size="20" font-weight="700" fill="${PALETTE.navy}" font-family="${HEADING}">${escapeXml(figure.value)}</text>` +
    `<text x="${WIDTH - 24 - figure.value.length * 13 - 12}" y="101" text-anchor="end" font-size="12" fill="${PALETTE.secondary}" font-family="${SANS}">${escapeXml(figure.caption)}</text>`
  )
}

function emptyBody(height: number): string {
  return `<text x="${WIDTH / 2}" y="${height / 2 + 20}" text-anchor="middle" font-size="14" fill="${PALETTE.secondary}" font-family="${SANS}">No data for this period</text>`
}

/** Scale and mapping shared by the axis charts. */
function axes(spec: AxisChartSpec, values: number[]) {
  const ticks = niceTicks(values)
  const min = ticks[0]
  const max = ticks[ticks.length - 1]
  const yOf = (v: number) => AXIS.bottom - ((v - min) / (max - min)) * (AXIS.bottom - AXIS.top)
  const xOf = (i: number) =>
    spec.labels.length === 1 ? (AXIS.left + AXIS.right) / 2 : AXIS.left + (i * (AXIS.right - AXIS.left)) / (spec.labels.length - 1)
  return { ticks, yOf, xOf }
}

function gridLines(ticks: number[], yOf: (v: number) => number, format: (v: number) => string): string {
  return ticks
    .map((value) => {
      const y = yOf(value)
      return (
        `<line x1="${AXIS.left}" x2="${AXIS.right}" y1="${y}" y2="${y}" stroke="${PALETTE.grid}"/>` +
        `<text x="${AXIS.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${PALETTE.secondary}" font-family="${SANS}">${escapeXml(format(value))}</text>`
      )
    })
    .join('')
}

function gridAndLabels(spec: AxisChartSpec, ticks: number[], yOf: (v: number) => number, xOf: (i: number) => number): string {
  const xLabelEvery = Math.ceil(spec.labels.length / MAX_X_LABELS)
  const xLabels = spec.labels
    .map((label, i) =>
      i % xLabelEvery === 0
        ? `<text x="${xOf(i)}" y="${AXIS.bottom + 20}" text-anchor="middle" font-size="11" fill="${PALETTE.secondary}" font-family="${SANS}">${escapeXml(label)}</text>`
        : '',
    )
    .join('')
  return gridLines(ticks, yOf, spec.format) + xLabels
}

/** The latest value of a series, highlighted with its value printed above it. */
function latestLabel(series: Series, spec: AxisChartSpec, xOf: (i: number) => number, yOf: (v: number) => number): string {
  const last = lastIndex(series.points)
  if (last === null) return ''
  const value = series.points[last] as number
  const x = xOf(last)
  // Near the right edge the label is anchored to its end, so it stays inside the card.
  const nearRight = x > AXIS.right - 40
  const labelX = nearRight ? x + 6 : x
  const anchor = nearRight ? 'end' : 'middle'
  const labelY = nearRight ? yOf(value) - 10 : yOf(value) - 12
  return (
    `<circle cx="${x}" cy="${yOf(value)}" r="5" fill="${series.color}" stroke="${PALETTE.card}" stroke-width="2"/>` +
    `<text x="${labelX}" y="${labelY}" text-anchor="${anchor}" font-size="12" font-weight="700" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(spec.format(value))}</text>`
  )
}

/** Runs of consecutive non-null indexes, so a gap breaks the line and the area. */
function segments(points: (number | null)[]): number[][] {
  const runs: number[][] = []
  let current: number[] = []
  points.forEach((v, i) => {
    if (v === null) {
      if (current.length > 0) runs.push(current)
      current = []
    } else {
      current.push(i)
    }
  })
  if (current.length > 0) runs.push(current)
  return runs
}

/** A column with rounded top corners and a flat base on the axis. */
function roundedTopBar(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height)
  return (
    `M${x} ${y + height} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + width - r} ${y} Q${x + width} ${y} ${x + width} ${y + r} ` +
    `L${x + width} ${y + height} Z`
  )
}

function lastIndex(points: (number | null)[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i] !== null) return i
  }
  return null
}

function isNumber(value: number | null): value is number {
  return value !== null
}

/**
 * Round tick values that cover the data and include zero, so the axis reads 0, 50, 100 rather than 0, 22, 44. The step
 * is 1, 2 or 5 times a power of ten.
 */
function niceTicks(values: number[]): number[] {
  const low = Math.min(0, ...values)
  const high = Math.max(...values)
  const rough = (high - low || 1) / TICK_COUNT
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const residual = rough / magnitude
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude
  const start = Math.floor(low / step) * step
  const end = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) {
    ticks.push(Number(v.toPrecision(12)))
  }
  return ticks
}
