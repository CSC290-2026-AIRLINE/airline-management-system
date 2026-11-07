import type { MatchLevel, MatchReason } from './bag-match.types'

/** The fields matching compares, from either a report or a found bag. */
export interface MatchSide {
  tagNumber: string | null
  flightId: string | null
  bagType: string | null
  colour: string | null
  brand: string | null
  description: string | null
}

export interface MatchScore {
  /** null: not similar enough to suggest. Staff can still link the pair by hand. */
  level: Exclude<MatchLevel, 'manual'> | null
  /** 0 to 100, for ordering suggestions of the same level. */
  score: number
  reasons: MatchReason[]
}

const WEIGHTS: Record<MatchReason, number> = {
  same_tag: 45,
  owner_tag: 35,
  same_flight: 15,
  same_type: 10,
  same_colour: 10,
  same_brand: 10,
  similar_description: 5,
}

/** Words of four letters or more, so "the", "and" or "bag" never make two descriptions look alike. */
function words(text: string | null): Set<string> {
  return new Set((text ?? '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])
}

function sameText(a: string | null, b: string | null): boolean {
  const x = a?.trim().toLowerCase()
  return !!x && x === b?.trim().toLowerCase()
}

/**
 * Compares a lost bag report with a found bag, following the F10 rules on bag_match:
 * strong is the same tag, or a found bag whose Feature 6 bag belongs to the report's booking passenger (ownerMatches);
 * possible is the same flight, bag type and colour. Brand and description only raise the score.
 */
export function scoreMatch(report: MatchSide, bag: MatchSide, ownerMatches = false): MatchScore {
  const reasons: MatchReason[] = []

  if (report.tagNumber && report.tagNumber === bag.tagNumber) reasons.push('same_tag')
  if (ownerMatches) reasons.push('owner_tag')
  if (report.flightId && report.flightId === bag.flightId) reasons.push('same_flight')
  if (report.bagType && report.bagType === bag.bagType) reasons.push('same_type')
  if (report.colour && report.colour === bag.colour) reasons.push('same_colour')
  if (sameText(report.brand, bag.brand)) reasons.push('same_brand')

  const reportWords = words(report.description)
  if ([...words(bag.description)].some((w) => reportWords.has(w))) reasons.push('similar_description')

  const has = (r: MatchReason) => reasons.includes(r)
  const level =
    has('same_tag') || has('owner_tag') ? 'strong' : has('same_flight') && has('same_type') && has('same_colour') ? 'possible' : null
  const score = Math.min(
    100,
    reasons.reduce((sum, r) => sum + WEIGHTS[r], 0),
  )

  return { level, score, reasons }
}
