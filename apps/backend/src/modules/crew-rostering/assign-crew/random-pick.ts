/**
 * The dice behind auto-assign.
 *
 * Auto-assign stands in for a roster tool that fills seats without being perfect, so Ops
 * have something to fix in the next step. Each seat is filled at random, and now and then the
 * pick is somebody who is qualified for the seat but not rested, which is what produces the
 * `REST_SHORT`, `OVERLAP` and `HOURS_28D` breaks. Pure, with the random source passed in, so
 * the odds can be tested with a fixed sequence.
 */

/** How often a seat is filled by someone who clears the role, licence and fleet checks but not rest or hours. */
export const BREAK_RATE = 0.25

/** How often the local-language speaker is left to chance instead of being picked first. */
export const LOCAL_MISS_RATE = 0.25

/** How often an international leg gets one police officer fewer than it needs. */
export const POLICE_SHORT_RATE = 0.25

/**
 * Picks one person for a seat.
 *
 * `legal` are the people who clear every rule; `loose` clear all but rest and hours (and so
 * include `legal`). With nobody legal the seat stays empty — that is `NO_LEGAL_CREW`, a real
 * shortage rather than a dice roll. Otherwise most picks are random among the legal people, and
 * `BREAK_RATE` of them are random among the loose-only people, when there are any.
 */
export function pickOne<T>(legal: readonly T[], loose: readonly T[], random: () => number, breakRate: number = BREAK_RATE): T | undefined {
  if (legal.length === 0) return undefined
  const legalSet = new Set(legal)
  const risky = loose.filter((candidate) => !legalSet.has(candidate))
  const source = risky.length > 0 && random() < breakRate ? risky : legal
  return source[Math.floor(random() * source.length)]
}
