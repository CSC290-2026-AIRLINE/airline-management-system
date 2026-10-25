import { BadRequestException } from '@nestjs/common'
import { CheckPipe, QueuePipe, ReviewPipe } from './screening.dto'
import { flightId, passengerId } from '../screening.test-fixtures'

describe('Screening boundary validation', () => {
  const body = { decision: 'confirmed', note: ' Compared passport ', passportCompared: true, expectedRevision: 0 }
  it('trims notes and requires revision zero for the first review', () => {
    expect(new ReviewPipe().transform(body)).toEqual({ ...body, note: 'Compared passport' })
  })
  it.each([
    { note: ' ' },
    { passportCompared: false },
    { passportCompared: 'true' },
    { expectedRevision: -1 },
    { expectedRevision: '1' },
    { expectedRevision: 0.5 },
    { expectedRevision: 2147483647 },
    { staffId: 'forged' },
    { decision: 'released' },
  ])('rejects invalid review input %j', (change) =>
    expect(() => new ReviewPipe().transform({ ...body, ...change })).toThrow(BadRequestException),
  )
  it('rejects malformed identities, client timestamps and unsupported triggers', () => {
    const check = { passengerId, flightId, triggerPoint: 'booking' }
    expect(new CheckPipe().transform(check)).toEqual(check)
    for (const change of [{ passengerId: 'bad' }, { occurredAt: '2026-01-01' }, { triggerPoint: 'manual' }])
      expect(() => new CheckPipe().transform({ ...check, ...change })).toThrow(BadRequestException)
  })
  it('validates queue options without accepting arrays or unbounded pages', () => {
    expect(new QueuePipe().transform({ limit: '100', q: ' MAYA ' })).toMatchObject({ limit: 100, q: 'MAYA' })
    for (const query of [{ limit: '101' }, { limit: '1.5' }, { sort: 'sql' }, { q: ['a', 'b'] }, { userId: 'fake' }])
      expect(() => new QueuePipe().transform(query)).toThrow(BadRequestException)
  })
})
