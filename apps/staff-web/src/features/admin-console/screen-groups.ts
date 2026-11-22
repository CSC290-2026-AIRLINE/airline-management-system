import { featureLabel } from './feature-labels'
import type { ScreenDto, ScreenGroup } from './types'

/**
 * One group of screens in the Role access matrix: a header bar plus its rows.
 *
 * Core screens are lifted into their own "CORE (EVERYONE)" group ahead of the per-feature groups, matching the design.
 * Feature groups follow in the order the API returned them.
 */
export interface DisplayGroup {
  key: string
  /** The feature number as the API stores it (`'15'`, `'3b'`) — used by the search, not shown. */
  featureNo: string
  title: string
  /** Set when every screen in the group is `admin` — the header then carries the lock note. */
  locked: boolean
  screens: ScreenDto[]
}

/** `5` or `05` → `F5 PAYMENTS`, as the group headers in the design read. A feature with no label shows its number only. */
export function featureTitle(featureNo: string): string {
  const no = featureNo.replace(/^0+(?=\d)/, '')
  const label = featureLabel(featureNo)
  return label.startsWith('FEATURE ') ? `F${no}` : `F${no} ${label}`
}

/** The Core group is pulled out of the feature groups and shown first, under its own heading. */
export function buildGroups(groups: ScreenGroup[]): DisplayGroup[] {
  const coreScreens: ScreenDto[] = []
  const byFeature = new Map<string, ScreenDto[]>()
  for (const g of groups) {
    for (const s of g.screens) {
      if (s.kind === 'core') {
        coreScreens.push(s)
        continue
      }
      const list = byFeature.get(g.feature_no) ?? []
      list.push(s)
      byFeature.set(g.feature_no, list)
    }
  }

  const out: DisplayGroup[] = []
  if (coreScreens.length > 0) {
    out.push({ key: 'core', featureNo: '1', title: 'CORE (EVERYONE)', locked: true, screens: coreScreens })
  }
  for (const [featureNo, screens] of byFeature) {
    out.push({
      key: featureNo,
      featureNo,
      title: featureTitle(featureNo),
      locked: screens.every((s) => s.kind === 'admin'),
      screens,
    })
  }
  return out
}

/**
 * Does this feature match the search? The search box says "e.g. F4, Pricing, Refunds" — so it takes the feature number
 * (`4`, `F4`), the feature's display label (`Pricing`), or a screen name.
 *
 * The number is compared as a whole (`4` must not match `14`), and the label is matched on its own so that a search for
 * `4` does not pull in every feature whose name happens to contain the digit.
 */
function featureMatches(featureNo: string, needle: string): boolean {
  const no = featureNo.replace(/^0+(?=\d)/, '').toLowerCase()
  if (needle === no || needle === `f${no}`) return true
  return featureLabel(featureNo).toLowerCase().includes(needle)
}

/**
 * The groups left after a search. A group survives when the feature itself matches, or when one of its screens does —
 * and then it keeps only the screens that matched, so searching "Refunds" narrows the list instead of just hiding
 * whole features.
 */
export function filterGroups(groups: DisplayGroup[], query: string): DisplayGroup[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return groups
  const out: DisplayGroup[] = []
  for (const group of groups) {
    const screens = group.screens.filter((s) => s.name.toLowerCase().includes(needle))
    if (screens.length > 0) {
      out.push({ ...group, screens })
      continue
    }
    if (featureMatches(group.featureNo, needle)) out.push(group)
  }
  return out
}
