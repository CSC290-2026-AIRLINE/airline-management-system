/**
 * Display names for the group headers on the Role access matrix. The admin API groups screens by `feature_no` and
 * carries no human-readable feature name, so the label is resolved here on the frontend.
 *
 * Display-only: unknown features fall back to `FEATURE <no>` rather than rendering blank, so a team that registers
 * screens before adding its label still gets a readable header.
 */
const FEATURE_LABELS: Record<string, string> = {
  '02': 'FLIGHT SCHEDULING',
  '05': 'PAYMENTS',
  '06': 'CHECK-IN',
  '08': 'CREW',
  '09': 'AIRCRAFT',
  '10': 'BAGGAGE',
  '13': 'CUSTOMER SERVICE',
  '14': 'BI',
  '15': 'ADMIN CONSOLE',
}

export function featureLabel(featureNo: string): string {
  return FEATURE_LABELS[featureNo] ?? `FEATURE ${featureNo}`
}
