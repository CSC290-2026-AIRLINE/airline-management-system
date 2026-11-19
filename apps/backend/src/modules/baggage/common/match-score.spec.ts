import { ownerMatch, scoreMatch, type MatchSide } from './match-score'

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

  it('is strong when the found bag belongs to the booking passenger on this flight, even without a tag on the report', () => {
    const result = scoreMatch({ ...report, tagNumber: null }, { ...report, flightId: OTHER_FLIGHT_ID, colour: 'blue' }, 'same_flight')

    expect(result.level).toBe('strong')
    expect(result.reasons).toContain('owner_tag')
    expect(result.reasons).not.toContain('same_tag')
  })

  it("is only possible when the passenger's bag was checked in on another flight", () => {
    const result = scoreMatch({ ...report, tagNumber: null }, { ...report, flightId: OTHER_FLIGHT_ID, colour: 'blue' }, 'other_flight')

    expect(result.level).toBe('possible')
    expect(result.reasons).toContain('owner_tag')
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
    expect(scoreMatch(report, report, 'same_flight').score).toBe(100)
  })
})

describe('ownerMatch', () => {
  const PASSENGER_ID = '55555555-5555-4555-8555-555555555555'
  const reportRow = { booking_passenger_id: PASSENGER_ID, flight_id: FLIGHT_ID }

  it("tells the passenger's bag on this flight from one checked in on another leg", () => {
    expect(ownerMatch(reportRow, { booking_passenger_id: PASSENGER_ID, flight_id: FLIGHT_ID })).toBe('same_flight')
    expect(ownerMatch(reportRow, { booking_passenger_id: PASSENGER_ID, flight_id: OTHER_FLIGHT_ID })).toBe('other_flight')
  })

  it("is none for someone else's bag or a bag with no Feature 6 record", () => {
    expect(ownerMatch(reportRow, { booking_passenger_id: '99999999-9999-4999-8999-999999999999', flight_id: FLIGHT_ID })).toBe('none')
    expect(ownerMatch(reportRow, null)).toBe('none')
  })
})
