/**
 * Cabin crew a leg needs, from the seats on its aircraft: `ceil(seats / seats_per_cabin_crew)`.
 *
 * The layout is Feature 9's `aircraft_type.layout` JSON (`{ cabins: [{ first_row, last_row, columns, skip_rows? }] }`). It is
 * read here rather than through Feature 9's code, because another team's module is only used through its exported providers.
 * Seats are counted the way Feature 9 counts a type's capacity: every row from first to last, less the skipped rows, times the
 * columns. A layout that cannot be read counts as no seats, so the leg still needs one cabin crew member.
 */

/** Never fewer than this, even for an empty or unreadable layout. */
export const MIN_CABIN_CREW = 1

/** The `seats_per_cabin_crew` default, used when the stored value is missing or not above 0. */
export const DEFAULT_SEATS_PER_CABIN_CREW = 50

export function countSeats(layout: unknown): number {
  const cabins = (layout as { cabins?: unknown } | null)?.cabins
  if (!Array.isArray(cabins)) return 0
  let total = 0
  for (const cabin of cabins as { first_row?: unknown; last_row?: unknown; columns?: unknown; skip_rows?: unknown }[]) {
    const first = cabin?.first_row
    const last = cabin?.last_row
    if (typeof first !== 'number' || typeof last !== 'number' || !Array.isArray(cabin.columns)) continue
    const rows = Math.max(last - first + 1, 0)
    const skipRows: unknown[] = Array.isArray(cabin.skip_rows) ? cabin.skip_rows : []
    const skipped = new Set(skipRows.filter((row) => typeof row === 'number' && row >= first && row <= last)).size
    total += Math.max(rows - skipped, 0) * cabin.columns.length
  }
  return total
}

export function cabinCrewFor(layout: unknown, seatsPerCabinCrew: number): number {
  const perCrew = Number.isFinite(seatsPerCabinCrew) && seatsPerCabinCrew > 0 ? seatsPerCabinCrew : DEFAULT_SEATS_PER_CABIN_CREW
  return Math.max(MIN_CABIN_CREW, Math.ceil(countSeats(layout) / perCrew))
}
