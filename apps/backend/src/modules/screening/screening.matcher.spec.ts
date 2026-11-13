import type { Prisma } from '@backend/db/generated/prisma/client'
import { ScreeningMatcher } from './screening.matcher'
import { entryFixture, passengerFixture } from './screening.test-fixtures'

describe('ScreeningMatcher', () => {
  it('uses PostgreSQL scores and filters out candidates below the applicable DOB threshold', async () => {
    const query = jest.fn().mockResolvedValue([
      { ...entryFixture(), similarity_score: 0.6 },
      { ...entryFixture({ id: 'below' }), similarity_score: 0.599 },
      { ...entryFixture({ id: 'probable', date_of_birth: passengerFixture().date_of_birth }), similarity_score: 0.5 },
    ])
    const result = await new ScreeningMatcher().match({ $queryRaw: query } as unknown as Prisma.TransactionClient, passengerFixture())
    expect(result.map((match) => match.level)).toEqual(['weak', 'probable'])
    const sql = (query.mock.calls[0][0] as TemplateStringsArray).join('?')
    expect(sql).toContain('GREATEST')
    expect(sql).toContain("w.status = 'active'")
    expect(sql).toContain('name_key')
    expect(sql).not.toContain(passengerFixture().passport_number)
  })
})
