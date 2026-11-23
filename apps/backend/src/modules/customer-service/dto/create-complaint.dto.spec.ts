import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateComplaintDto } from './create-complaint.dto'

/** The failing property names, as the controller's ValidationPipe (whitelist + forbidNonWhitelisted) would see them. */
async function failing(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateComplaintDto, body), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

const FLIGHT_COMPLAINT = {
  type: 'flight',
  flight_number: 'FY 308',
  service_date: '2026-11-12',
  issue: 'delay',
  description: 'The flight left three hours late with no announcement.',
}

describe('CreateComplaintDto', () => {
  it('accepts a flight complaint with a booking reference', async () => {
    expect(await failing({ ...FLIGHT_COMPLAINT, booking_reference: 'abc123' })).toEqual([])
  })

  it.each(['surname', 'contact_email', 'contact_phone'])('rejects the old guest field %s', async (field) => {
    expect(await failing({ ...FLIGHT_COMPLAINT, [field]: 'x' })).toEqual([field])
  })
})
