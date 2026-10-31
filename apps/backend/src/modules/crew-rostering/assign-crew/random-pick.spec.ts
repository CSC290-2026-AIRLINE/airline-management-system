import { BREAK_RATE, pickOne } from './random-pick'

/** Plays the given numbers in order: the first is the break roll, the second chooses within the pool. */
function sequence(...values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}

describe('pickOne', () => {
  const legal = ['rested-a', 'rested-b']
  const loose = ['rested-a', 'rested-b', 'tired']

  it('leaves the seat empty when nobody is legal, however the dice fall', () => {
    expect(pickOne([], loose, () => 0)).toBeUndefined()
  })

  it('picks among the legal people by default', () => {
    expect(pickOne(legal, loose, sequence(0.9, 0))).toBe('rested-a')
    expect(pickOne(legal, loose, sequence(0.9, 0.99))).toBe('rested-b')
  })

  it('picks someone qualified but not rested when the break roll hits', () => {
    expect(pickOne(legal, loose, sequence(BREAK_RATE - 0.01, 0))).toBe('tired')
  })

  it('stays legal when nobody is tired, even on a break roll', () => {
    expect(pickOne(legal, legal, sequence(0, 0))).toBe('rested-a')
  })

  it('varies over many picks, with a share of breaks near the rate', () => {
    let breaks = 0
    const picks = 4000
    for (let index = 0; index < picks; index += 1) if (pickOne(legal, loose, Math.random) === 'tired') breaks += 1
    expect(breaks / picks).toBeGreaterThan(BREAK_RATE - 0.06)
    expect(breaks / picks).toBeLessThan(BREAK_RATE + 0.06)
  })
})
