import { NoBookingsSeatAvailability } from './seat-availability'

describe('NoBookingsSeatAvailability', () => {
  it('never guesses the load: it fails, so the quote becomes 502 UPSTREAM_UNAVAILABLE', async () => {
    await expect(new NoBookingsSeatAvailability().seatsLeftPct()).rejects.toThrow('not connected')
  })
})
