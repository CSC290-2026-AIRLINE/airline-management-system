/** The five Business intelligence views, each at its own URL under `/bi`. */
export type BiView = 'operations' | 'finance' | 'no-shows' | 'extra-revenue' | 'aircraft-use'

export interface BiViewInfo {
  id: BiView
  label: string
  path: '/bi/operations' | '/bi/finance' | '/bi/no-shows' | '/bi/extra-revenue' | '/bi/aircraft-use'
  /**
   * The Feature 15 screen the backend checks for this view's data, so a role only sees the views it can load. Extra
   * revenue is payment money, so it is a finance screen.
   */
  screen: 'f14.operations' | 'f14.finance'
}

/** In tab order. `/bi` opens the first one the signed-in role can see, so a finance-only role lands on the report. */
export const BI_VIEWS: BiViewInfo[] = [
  { id: 'operations', label: 'Operations', path: '/bi/operations', screen: 'f14.operations' },
  { id: 'finance', label: 'Financial report', path: '/bi/finance', screen: 'f14.finance' },
  { id: 'no-shows', label: 'No-shows', path: '/bi/no-shows', screen: 'f14.operations' },
  { id: 'extra-revenue', label: 'Extra revenue', path: '/bi/extra-revenue', screen: 'f14.finance' },
  { id: 'aircraft-use', label: 'Aircraft use', path: '/bi/aircraft-use', screen: 'f14.operations' },
]

/** The view a child route of `/bi` shows (`/_authenticated/bi/finance` → finance), or null when no view route matched. */
export function viewFromRouteId(routeId: string | undefined): BiViewInfo | null {
  const segment = routeId?.match(/^\/_authenticated\/bi\/([^/]+)$/)?.[1]
  return BI_VIEWS.find((view) => view.id === segment) ?? null
}
