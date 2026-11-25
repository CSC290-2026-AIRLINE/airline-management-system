/** Tailwind classes shared by the BI views, so their cards, grids and tooltips look the same on every page. */

/** The four headline figures: one column on a phone, two on a tablet, four on a laptop. */
export const KPI_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:break-inside-avoid'

/** Two charts side by side from laptop width; stacked below it. */
export const CHART_GRID = 'grid grid-cols-1 gap-4 lg:grid-cols-2 print:grid-cols-2'

/** A content card: the shadcn Card with the app's flat look (as on the customer-service charts page). */
export const CARD = 'min-w-0 gap-3 px-5 py-4 shadow-none print:break-inside-avoid'

export const CARD_TITLE = 'm-0 text-base font-bold text-foreground'

/** The "no data" line inside a chart card, as tall as a chart so the grid does not jump. */
export const EMPTY_TEXT = 'flex min-h-60 items-center justify-center text-center text-sm text-muted-foreground'

export const FOOTNOTE = 'text-xs text-muted-foreground'

/** The hover tooltip of a chart point, bar or ranked row: a bold first line, then lighter lines. */
export const TOOLTIP = 'flex max-w-80 flex-col gap-1 px-3 py-2.5 text-xs leading-normal [&>span]:font-normal [&>span]:opacity-85'

export type Trend = 'good' | 'bad' | 'neutral'

/** The colour of a change against the previous period. */
export function trendClass(trend: Trend): string {
  return trend === 'good' ? 'text-success-strong' : trend === 'bad' ? 'text-destructive' : 'text-muted-foreground'
}
