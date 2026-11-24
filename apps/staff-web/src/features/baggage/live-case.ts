/** Case statuses that still hold a bag tag (the backend's lost_bag_report_open_tag_uq): one live case per tag. */
export const LIVE_CASE_STATUSES = ['open', 'matched', 'delivering', 'lost'] as const

/** The case number of the live case among a tag's cases, or null when every case for it is closed or cancelled. */
export function liveCaseNumber(cases: ReadonlyArray<{ caseNumber: string; status: string }>): string | null {
  return cases.find((c) => (LIVE_CASE_STATUSES as readonly string[]).includes(c.status))?.caseNumber ?? null
}
