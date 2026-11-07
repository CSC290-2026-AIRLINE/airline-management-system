import { CheckInError, invalidState, notFound, validation } from './errors'

describe('CheckInError', () => {
  it('serialises to the { error: { code, message, details } } envelope', () => {
    const e = new CheckInError(409, 'SEAT_TAKEN', 'Seat 12A is taken', { seatCode: '12A' })
    expect(e.getStatus()).toBe(409)
    expect(e.getResponse()).toEqual({ error: { code: 'SEAT_TAKEN', message: 'Seat 12A is taken', details: { seatCode: '12A' } } })
  })
  it('omits details when none are given', () => {
    expect(new CheckInError(404, 'NOT_FOUND', 'x').getResponse()).toEqual({ error: { code: 'NOT_FOUND', message: 'x' } })
  })
  it('factories pick the status', () => {
    expect(notFound('check-in').getStatus()).toBe(404)
    expect(validation('bad').getStatus()).toBe(400)
    expect(invalidState('no').getStatus()).toBe(409)
  })
})
