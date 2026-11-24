import { ValidationPipe } from '@nestjs/common'
import { UpdateBaggageSettingsDto } from './update-baggage-settings.dto'

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
const transform = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: UpdateBaggageSettingsDto })

describe('UpdateBaggageSettingsDto', () => {
  it.each([
    [1, 7],
    [365, 3650],
    [21, 90],
  ])('accepts lostAfterDays %i and unclaimedAfterDays %i', async (lostAfterDays, unclaimedAfterDays) => {
    await expect(transform({ lostAfterDays, unclaimedAfterDays })).resolves.toMatchObject({ lostAfterDays, unclaimedAfterDays })
  })

  it.each([
    ['lostAfterDays 0', { lostAfterDays: 0, unclaimedAfterDays: 90 }],
    ['lostAfterDays 366', { lostAfterDays: 366, unclaimedAfterDays: 90 }],
    ['unclaimedAfterDays 6', { lostAfterDays: 21, unclaimedAfterDays: 6 }],
    ['unclaimedAfterDays 3651', { lostAfterDays: 21, unclaimedAfterDays: 3651 }],
    ['a fraction', { lostAfterDays: 21.5, unclaimedAfterDays: 90 }],
    ['a numeric string', { lostAfterDays: '21', unclaimedAfterDays: 90 }],
    ['a negative number', { lostAfterDays: -1, unclaimedAfterDays: 90 }],
    ['null', { lostAfterDays: null, unclaimedAfterDays: 90 }],
  ])('rejects %s', async (_label, body) => {
    await expect(transform(body)).rejects.toThrow()
  })

  it('is a full replacement: each value is required', async () => {
    await expect(transform({ lostAfterDays: 21 })).rejects.toThrow()
    await expect(transform({ unclaimedAfterDays: 90 })).rejects.toThrow()
    await expect(transform({})).rejects.toThrow()
  })

  it('rejects unknown fields, including client-supplied identity', async () => {
    await expect(
      transform({ lostAfterDays: 21, unclaimedAfterDays: 90, updatedBy: '00000000-0000-4000-8000-000000000001' }),
    ).rejects.toThrow()
  })
})
