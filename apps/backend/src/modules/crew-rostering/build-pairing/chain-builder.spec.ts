import { buildChains, shuffle, type ChainFlight } from './chain-builder'

const HOUR = 3_600_000
const at = (hour: number) => new Date(Date.UTC(2026, 8, 15) + hour * HOUR)

function flight(id: string, origin: string, destination: string, dep: number, arr: number): ChainFlight {
  return { id, dep_at: at(dep), arr_at: at(arr), route: { origin, destination } }
}

/** A fixed sequence of "random" numbers, cycling, so a test chooses exactly which option wins. */
function sequence(...values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}

const always = () => true

describe('buildChains', () => {
  const outbound = flight('out', 'BKK', 'NRT', 0, 6)
  const home = flight('home', 'NRT', 'BKK', 8, 14)
  const onward = flight('onward', 'NRT', 'ICN', 8, 12)

  it('closes a chain back at base', () => {
    const chains = buildChains([outbound, home], 'BKK', 60, always, sequence(0))
    expect(chains.map((chain) => chain.map((item) => item.id))).toEqual([['out', 'home']])
  })

  it('prefers the flight that goes home, then follows the dice when they say otherwise', () => {
    // The only seed needs no shuffle roll, so the first number is the preference roll: 0.1 < 0.7, homeward wins.
    const homeward = buildChains([outbound, home, onward], 'BKK', 60, always, sequence(0.1, 0))
    expect(homeward[0].map((item) => item.id)).toEqual(['out', 'home'])
    // 0.9 >= 0.7, so any option may win; 0.99 picks the last of the two.
    const away = buildChains([outbound, home, onward], 'BKK', 60, always, sequence(0.9, 0.99))
    expect(away[0].map((item) => item.id)).toEqual(['out', 'onward'])
  })

  it('leaves a chain open when nothing can follow, so it is stored Invalid for Ops', () => {
    const chains = buildChains([outbound, onward], 'BKK', 60, always, sequence(0))
    expect(chains[0].map((item) => item.id)).toEqual(['out', 'onward'])
  })

  it('respects the minimum connection time and the pairing-length limit', () => {
    const tight = flight('tight', 'NRT', 'BKK', 6.5, 12)
    expect(buildChains([outbound, tight], 'BKK', 60, always, sequence(0))[0].map((item) => item.id)).toEqual(['out'])
    expect(buildChains([outbound, home], 'BKK', 60, () => false, sequence(0))[0].map((item) => item.id)).toEqual(['out'])
  })

  it('uses every flight once and only starts chains at base', () => {
    const flights = [outbound, home, onward, flight('later', 'BKK', 'CNX', 20, 22), flight('back', 'CNX', 'BKK', 24, 26)]
    const chains = buildChains(flights, 'BKK', 60, always, Math.random)
    const used = chains.flat().map((item) => item.id)
    expect(new Set(used).size).toBe(used.length)
    expect(chains.every((chain) => chain[0].route.origin === 'BKK')).toBe(true)
  })

  it('does not always build the same pairings', () => {
    const flights = [
      outbound,
      home,
      onward,
      flight('b2', 'BKK', 'SIN', 1, 4),
      flight('s2', 'SIN', 'BKK', 6, 9),
      flight('s3', 'SIN', 'KUL', 6, 7),
    ]
    const seen = new Set<string>()
    for (let run = 0; run < 60; run += 1) {
      seen.add(
        buildChains(flights, 'BKK', 60, always)
          .map((chain) => chain.map((item) => item.id).join('>'))
          .join('|'),
      )
    }
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('shuffle', () => {
  it('keeps every item and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffle(input, Math.random)
    expect([...output].sort()).toEqual([1, 2, 3, 4, 5])
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})
