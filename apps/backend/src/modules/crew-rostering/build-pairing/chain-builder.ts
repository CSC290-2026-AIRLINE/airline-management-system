/**
 * Builds the draft pairings out of the window's free flights.
 *
 * Pure on purpose: it reads no database and takes its randomness as an argument, so the rules
 * below can be tested with a fixed sequence. `BuildPairingService.generatePairings` feeds it the
 * flights and stores what it returns.
 *
 *  · Every chain starts at the base, in a random order of seeds.
 *  · After each flight the next one is picked at random from the flights that can follow it
 *    (leave where it landed, after the minimum connection, inside the pairing-length limit).
 *  · When one of those flights goes home, it is preferred seven times in ten, so most chains
 *    close at base and some do not. The ones that do not are stored as Invalid for Ops to repair,
 *    exactly as before.
 */
export interface ChainFlight {
  id: string
  dep_at: Date
  arr_at: Date
  route: { origin: string; destination: string }
}

/** How often a flight that returns to base wins over the other options. */
export const RETURN_PREFERENCE = 0.7

/** Fisher–Yates on a copy, so the caller's list keeps its order. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

export function buildChains<F extends ChainFlight>(
  free: readonly F[],
  base: string,
  minConnectionMinutes: number,
  /** True when `flight` still fits inside the pairing that started with `seed`. */
  withinSpan: (seed: F, flight: F) => boolean,
  random: () => number = Math.random,
): F[][] {
  const used = new Set<string>()
  const chains: F[][] = []

  for (const seed of shuffle(
    free.filter((flight) => flight.route.origin === base),
    random,
  )) {
    if (used.has(seed.id)) continue
    const chain = [seed]
    used.add(seed.id)

    let last = seed
    while (last.route.destination !== base) {
      const previous = last
      const options = free.filter(
        (flight) =>
          !used.has(flight.id) &&
          flight.route.origin === previous.route.destination &&
          flight.dep_at.getTime() >= previous.arr_at.getTime() + minConnectionMinutes * 60_000 &&
          withinSpan(seed, flight),
      )
      if (options.length === 0) break

      const homeward = options.filter((flight) => flight.route.destination === base)
      const pool = homeward.length > 0 && random() < RETURN_PREFERENCE ? homeward : options
      const next = pool[Math.floor(random() * pool.length)]
      chain.push(next)
      used.add(next.id)
      last = next
    }
    chains.push(chain)
  }

  // Listed by first departure, so the pairing codes still read in time order.
  return chains.sort((a, b) => a[0].dep_at.getTime() - b[0].dep_at.getTime())
}
