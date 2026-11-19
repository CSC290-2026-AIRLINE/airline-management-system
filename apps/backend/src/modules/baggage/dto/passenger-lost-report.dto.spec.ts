import { ValidationPipe } from '@nestjs/common'
import { CreatePassengerLostReportDto } from './passenger-lost-report.dto'

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
const base = {
  bookingReference: 'K7QX2M',
  surname: 'Eriksson',
  flightId: '00000000-0000-4000-8000-000000000001',
  bagType: 'suitcase',
  colour: 'black',
}

function transform(input: Record<string, unknown>) {
  return pipe.transform(input, { type: 'body', metatype: CreatePassengerLostReportDto })
}

describe('CreatePassengerLostReportDto.bookingPassengerId', () => {
  it('is optional, so the own-bag request body is unchanged', async () => {
    await expect(transform(base)).resolves.toMatchObject(base)
  })

  it('accepts a UUID for another traveller', async () => {
    const bookingPassengerId = '00000000-0000-4000-8000-0000000000b2'

    await expect(transform({ ...base, bookingPassengerId })).resolves.toMatchObject({ bookingPassengerId })
  })

  it.each(['not-a-uuid', '', '12345'])('rejects a malformed traveller ID: %p', async (bookingPassengerId) => {
    await expect(transform({ ...base, bookingPassengerId })).rejects.toThrow()
  })

  it('still rejects a client-supplied passengerId or reportedByCustomerId', async () => {
    await expect(transform({ ...base, passengerId: '00000000-0000-4000-8000-000000000009' })).rejects.toThrow()
    await expect(transform({ ...base, reportedByCustomerId: '00000000-0000-4000-8000-000000000009' })).rejects.toThrow()
  })
})
