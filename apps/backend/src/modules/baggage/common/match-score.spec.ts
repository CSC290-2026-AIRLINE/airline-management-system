import { scoreMatch, type MatchSide } from './match-score'

const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_FLIGHT_ID = '33333333-3333-4333-8333-333333333333'

const report: MatchSide = {
  tagNumber: '0789204511',
  flightId: FLIGHT_ID,
  bagType: 'suitcase',
  colour: 'black',
  brand: 'Samsonite',
  description: 'Yellow strap around the middle',
}

describe('scoreMatch', () => {
  it('is strong with every reason when the same tag and details match', () => {
    const result = scoreMatch(report, { ...report, brand: 'samsonite ', description: 'Yellow strap' })

    expect(result.level).toBe('strong')
    expect(result.reasons).toEqual(['same_tag', 'same_flight', 'same_type', 'same_colour', 'same_brand', 'similar_description'])
    expect(result.score).toBe(95)
  })

  it('is strong when the found bag belongs to the booking passenger, even without a tag on the report', () => {
    const result = scoreMatch({ ...report, tagNumber: null }, { ...report, flightId: OTHER_FLIGHT_ID, colour: 'blue' }, true)

    expect(result.level).toBe('strong')
    expect(result.reasons).toContain('owner_tag')
    expect(result.reasons).not.toContain('same_tag')
  })

  it('is possible for the same flight, type and colour', () => {
    const result = scoreMatch({ ...report, tagNumber: null }, { ...report, tagNumber: null, brand: null, description: null })

    expect(result).toEqual({ level: 'possible', score: 35, reasons: ['same_flight', 'same_type', 'same_colour'] })
  })

  it('suggests nothing when only the type and colour match', () => {
    const result = scoreMatch({ ...report, tagNumber: null }, { ...report, tagNumber: null, flightId: OTHER_FLIGHT_ID })

    expect(result.level).toBeNull()
  })

  it('suggests nothing for a different colour on the same flight', () => {
    expect(scoreMatch({ ...report, tagNumber: null }, { ...report, tagNumber: null, colour: 'red' }).level).toBeNull()
  })

  it('does not count short or missing words as a similar description', () => {
    const bag = { ...report, tagNumber: null, description: 'the bag' }

    expect(scoreMatch({ ...report, description: 'the bag is old' }, bag).reasons).not.toContain('similar_description')
    expect(scoreMatch({ ...report, description: null }, bag).reasons).not.toContain('similar_description')
  })

  it('never counts two missing tags, flights or brands as the same', () => {
    const blank: MatchSide = { tagNumber: null, flightId: null, bagType: null, colour: null, brand: null, description: null }

    expect(scoreMatch(blank, blank)).toEqual({ level: null, score: 0, reasons: [] })
  })

  it('caps the score at 100', () => {
    expect(scoreMatch(report, report, true).score).toBe(100)
  })
})
