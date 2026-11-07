import { BOOKING_REFERENCE_ALPHABET, insertWithBookingReference, newBookingReference } from './booking-reference'

describe('booking reference generator', () => {
  it('uses the allowed alphabet', () => {
    const reference = newBookingReference(6, () => 0.5)
    expect(reference).toHaveLength(6)
    for (const character of reference) {
      expect(BOOKING_REFERENCE_ALPHABET).toContain(character)
    }
  })

  it('retries when the insert reports a duplicate', async () => {
    const insert = jest.fn().mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValue('created')

    await expect(insertWithBookingReference(insert, undefined, () => 0.1)).resolves.toBe('created')
    expect(insert).toHaveBeenCalledTimes(2)
  })
})
