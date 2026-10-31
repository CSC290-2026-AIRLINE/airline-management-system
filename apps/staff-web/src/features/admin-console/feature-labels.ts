/**
 * Display names for the feature groups and for the audit log's feature filter.
 *
 * The keys are the feature numbers **as the API and the database store them** — plain strings, no zero padding
 * (`'2'`, `'15'`). `screen.feature_no` and `audit_log.source_feature` both hold that form, and the audit filter sends
 * the key straight to `GET /api/admin/audit-log?source_feature=…`, so a padded key here would match no rows at all.
 * `featureLabel` still accepts the padded form, because some documents and older call sites write it that way.
 *
 * F1 is the shared staff/user identity (platform-owned). F2–F17 are the feature teams; F16 is not listed here.
 *
 * Display-only: an unknown feature falls back to `FEATURE <no>` rather than rendering blank, so a team that registers
 * screens before adding its label still gets a readable header.
 */
const FEATURE_LABELS: Record<string, string> = {
  '1': 'CORE',
  '2': 'FLIGHT SCHEDULING',
  '3': 'BOOKING ENGINE',
  '4': 'PRICING & FARE RULES',
  '5': 'PAYMENTS',
  '6': 'CHECK-IN',
  '7': 'PASSENGER PROFILE',
  '8': 'CREW',
  '9': 'AIRCRAFT',
  '10': 'BAGGAGE',
  '11': 'LOYALTY PROGRAM',
  '12': 'ONBOARD PRODUCT',
  '13': 'CUSTOMER SERVICE',
  '14': 'BUSINESS INTELLIGENCE DASHBOARD',
  '15': 'ADMIN CONSOLE',
  '17': 'CARGO & FREIGHT',
}

/** `'02'` and `'2'` are the same feature — the padding is a display habit, not part of the number. */
function normalize(featureNo: string): string {
  return featureNo.replace(/^0+(?=\d)/, '')
}

/** The label for a feature number, or `FEATURE <no>` when the feature has no label yet. */
export function featureLabel(featureNo: string): string {
  const key = normalize(featureNo)
  return FEATURE_LABELS[key] ?? `FEATURE ${key}`
}

/** `'2'` before `'10'`, and `'3'` before `'3b'`. */
function compareFeatureNumbers(a: string, b: string): number {
  const na = Number.parseInt(a, 10)
  const nb = Number.parseInt(b, 10)
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return a.localeCompare(b)
}

/**
 * Every feature listed above except F1, ascending — powers the audit log's Feature filter dropdown. These are the
 * values sent to the API, so they are the same unpadded strings the database stores. F1 is the shared core identity
 * (platform-owned) and never appears in `audit_log.source_feature`, so it is not a filter option.
 */
export const FEATURE_NUMBERS: string[] = Object.keys(FEATURE_LABELS)
  .filter((featureNo) => featureNo !== '1')
  .sort(compareFeatureNumbers)
