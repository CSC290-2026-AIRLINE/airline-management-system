/**
 * Pure SVG chart rendering. No I/O and no chart library: the colours and fonts are the staff app's own (see
 * apps/staff-web/src/index.css), so a chart reads as part of the same product.
 *
 * Each chart is a card with a title, a subtitle, the data drawn as marks, and a `<title>`/`<desc>` pair so screen readers
 * get the same summary as the picture. Colour is never the only signal: series are also named in the legend.
 */

export const PALETTE = {
  navy: '#14213d',
  navyActive: '#2a4372',
  gold: '#f2a800',
  danger: '#b8171f',
  ink: '#0a1424',
  muted: '#5a6679',
  line: '#e6e8ef',
  border: '#d9dfe9',
  card: '#ffffff',
  page: '#f7f9fc',
} as const

const WIDTH = 720
const SANS = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const HEADING = "Merriweather, Georgia, 'Times New Roman', serif"
const TICK_COUNT = 4
const MAX_X_LABELS = 8

export interface LineSeries {
  name: string
  color: string
  /** One value per label. `null` breaks the line (no data for that day). */
  points: (number | null)[]
}

export interface LineChartSpec {
  title: string
  subtitle: string
  labels: string[]
  series: LineSeries[]
  format: (value: number) => string
}

export interface BarChartSpec {
  title: string
  subtitle: string
  bars: { label: string; value: number }[]
  format: (value: number) => string
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

export function renderLineChart(spec: LineChartSpec): string {
  const left = 64
  const right = WIDTH - 48
  const top = 118
  const bottom = 300
  const height = 340
  const values = spec.series.flatMap((s) => s.points).filter((v): v is number => v !== null)

  if (values.length === 0 || spec.labels.length === 0) {
    return frame(spec, height, emptyBody(height))
  }

  const ticks = niceTicks(values)
  const min = ticks[0]
  const max = ticks[ticks.length - 1]
  const yOf = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top)
  const xOf = (i: number) => (spec.labels.length === 1 ? (left + right) / 2 : left + (i * (right - left)) / (spec.labels.length - 1))

  const grid = ticks
    .map((value) => {
      const y = yOf(value)
      return (
        `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="${PALETTE.line}"/>` +
        `<text x="${left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="${PALETTE.muted}" font-family="${SANS}">${escapeXml(spec.format(value))}</text>`
      )
    })
    .join('')

  const xLabelEvery = Math.ceil(spec.labels.length / MAX_X_LABELS)
  const xLabels = spec.labels
    .map((label, i) =>
      i % xLabelEvery === 0
        ? `<text x="${xOf(i)}" y="${bottom + 20}" text-anchor="middle" font-size="11" fill="${PALETTE.muted}" font-family="${SANS}">${escapeXml(label)}</text>`
        : '',
    )
    .join('')

  const lines = spec.series
    .map((series) => {
      const path = linePath(series.points, xOf, yOf)
      const dots = series.points
        .map((v, i) => (v === null ? '' : `<circle cx="${xOf(i)}" cy="${yOf(v)}" r="2.5" fill="${series.color}"/>`))
        .join('')
      const last = lastValue(series.points)
      const highlight = last
        ? `<circle cx="${xOf(last.index)}" cy="${yOf(last.value)}" r="5" fill="${PALETTE.gold}" stroke="${PALETTE.card}" stroke-width="2"/>` +
          `<text x="${xOf(last.index)}" y="${yOf(last.value) - 12}" text-anchor="middle" font-size="12" font-weight="600" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(spec.format(last.value))}</text>`
        : ''
      return `<path d="${path}" fill="none" stroke="${series.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>${dots}${highlight}`
    })
    .join('')

  const body = `${grid}${xLabels}${lines}`
  return frame(spec, height, body, legend(spec.series))
}

export function renderBarChart(spec: BarChartSpec): string {
  const rowHeight = 36
  const top = 118
  const labelWidth = 150
  const barLeft = 24 + labelWidth
  const barRight = WIDTH - 110
  const height = Math.max(200, top + spec.bars.length * rowHeight + 24)

  if (spec.bars.length === 0) {
    return frame(spec, height, emptyBody(height))
  }

  const max = Math.max(...spec.bars.map((b) => b.value), 0) || 1
  const rows = spec.bars
    .map((bar, i) => {
      const y = top + i * rowHeight
      const barWidth = Math.max(0, (bar.value / max) * (barRight - barLeft))
      const isMax = bar.value === max && max > 0
      return (
        `<text x="24" y="${y + 18}" font-size="13" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(bar.label)}</text>` +
        `<rect x="${barLeft}" y="${y + 4}" width="${barWidth}" height="18" rx="4" fill="${isMax ? PALETTE.gold : PALETTE.navy}"/>` +
        `<text x="${barLeft + barWidth + 8}" y="${y + 18}" font-size="12" font-weight="600" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(spec.format(bar.value))}</text>`
      )
    })
    .join('')

  return frame(spec, height, rows)
}

/** Wraps the body in a card with the title, subtitle, and an accessible name and description. */
function frame(spec: { title: string; subtitle: string }, height: number, body: string, extra = ''): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="chart-title chart-desc">` +
    `<title id="chart-title">${escapeXml(spec.title)}</title>` +
    `<desc id="chart-desc">${escapeXml(spec.subtitle)}</desc>` +
    `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="12" fill="${PALETTE.card}" stroke="${PALETTE.border}"/>` +
    `<text x="24" y="38" font-size="18" font-weight="700" fill="${PALETTE.navy}" font-family="${HEADING}">${escapeXml(spec.title)}</text>` +
    `<text x="24" y="60" font-size="13" fill="${PALETTE.muted}" font-family="${SANS}">${escapeXml(spec.subtitle)}</text>` +
    extra +
    body +
    `</svg>`
  )
}

function legend(series: LineSeries[]): string {
  return series
    .map((s, i) => {
      const x = 24 + i * 180
      return (
        `<rect x="${x}" y="82" width="12" height="12" rx="3" fill="${s.color}"/>` +
        `<text x="${x + 18}" y="93" font-size="12" fill="${PALETTE.ink}" font-family="${SANS}">${escapeXml(s.name)}</text>`
      )
    })
    .join('')
}

function emptyBody(height: number): string {
  return `<text x="${WIDTH / 2}" y="${height / 2 + 20}" text-anchor="middle" font-size="14" fill="${PALETTE.muted}" font-family="${SANS}">No data for this period</text>`
}

function linePath(points: (number | null)[], xOf: (i: number) => number, yOf: (v: number) => number): string {
  let path = ''
  let drawing = false
  points.forEach((v, i) => {
    if (v === null) {
      drawing = false
      return
    }
    path += `${drawing ? 'L' : 'M'}${xOf(i)} ${yOf(v)} `
    drawing = true
  })
  return path.trim()
}

function lastValue(points: (number | null)[]): { index: number; value: number } | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const value = points[i]
    if (value !== null) return { index: i, value }
  }
  return null
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
