/**
 * Builds the draft pairings out of the window's free flights.
 *
 * Pure on purpose: it reads no database and takes its randomness as an argument, so the rules
 * below can be tested with a fixed sequence. `BuildPairingService.generatePairings` feeds it the
 * flights and stores what it returns.
 *
 *  · Every chain starts at the base, in a random order of seeds. The service passes `seededRandom`, so "random" is
 *    repeatable: the same window and flights give the same chains.
 *  · After each flight the next one is picked at random from the flights that can follow it
 *    (leave where it landed, after the minimum connection, inside the pairing-length limit, on the
 *    seed's aircraft model, because the same crew fly every leg and each holds one fleet type).
 *  · When one of those flights goes home, it is preferred seven times in ten, so most chains
 *    close at base and some do not. The ones that do not are stored as Invalid for Ops to repair,
 *    exactly as before.
 */
export interface ChainFlight {
  id: string
  dep_at: Date
  arr_at: Date
  route: { origin: string; destination: string }
  aircraft: { aircraft_type: { model: string } }
}

/** How often a flight that returns to base wins over the other options. */
export const RETURN_PREFERENCE = 0.7

/**
 * A repeatable `random` for `buildChains`: the same key always gives the same sequence (FNV-1a hash into mulberry32).
 * Keyed on the window and its free flights, Generate proposes the same pairings for the same input every time.
 */
export function seededRandom(key: string): () => number {
  let state = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) state = Math.imul(state ^ key.charCodeAt(index), 0x01000193)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

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
          flight.aircraft.aircraft_type.model === seed.aircraft.aircraft_type.model &&
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
