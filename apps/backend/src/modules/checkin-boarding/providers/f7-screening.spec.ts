import type { ScreeningCheckService } from '@backend/modules/screening/screening-check.service'
import { F7Screening } from './f7-screening'

// Feature 7's service is replaced by a mock below; its real module chain would load the Prisma client.
jest.mock('@backend/modules/screening/screening-check.service', () => ({ ScreeningCheckService: class {} }))

const INPUT = { passengerId: 'pax-1', flightId: 'flt-1', numberLast4: '4567', lastName: 'Sukjai' }

function screeningAnswering(result: unknown) {
  const checkSystem = jest.fn().mockResolvedValue(result)
  return { provider: new F7Screening({ checkSystem } as unknown as ScreeningCheckService), checkSystem }
}

describe('F7Screening', () => {
  it('asks feature 7 for a check-in screening of the passenger on the flight', async () => {
    const { provider, checkSystem } = screeningAnswering({ runId: 'run-1', outcome: 'clear' })
    await expect(provider.check(INPUT)).resolves.toEqual({ runId: 'run-1', outcome: 'clear' })
    expect(checkSystem).toHaveBeenCalledWith('checkin_boarding', { passengerId: 'pax-1', flightId: 'flt-1', triggerPoint: 'check_in' })
  })

  it('holds a passenger feature 7 holds', async () => {
    const { provider } = screeningAnswering({ runId: 'run-2', outcome: 'held' })
    await expect(provider.check(INPUT)).resolves.toEqual({ runId: 'run-2', outcome: 'held' })
  })

  it('holds a passenger feature 7 denies, so a confirmed match is never cleared', async () => {
    const { provider } = screeningAnswering({ runId: 'run-3', outcome: 'denied' })
    await expect(provider.check(INPUT)).resolves.toEqual({ runId: 'run-3', outcome: 'held' })
  })

  it('holds the passenger with a fresh run id when screening could not run, as the on-hold row needs one', async () => {
    const { provider } = screeningAnswering({ skipped: true, outcome: 'held' })
    const result = await provider.check(INPUT)
    expect(result.outcome).toBe('held')
    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('reads where a held passenger stands now from feature 7', async () => {
    const statusSystem = jest.fn().mockResolvedValue({ outcome: 'clear' })
    const provider = new F7Screening({ statusSystem } as unknown as ScreeningCheckService)
    await expect(provider.status({ passengerId: 'pax-1', flightId: 'flt-1' })).resolves.toBe('clear')
    expect(statusSystem).toHaveBeenCalledWith('checkin_boarding', 'pax-1', 'flt-1')
  })

  it('lets a caller mistake from feature 7 surface as an error', async () => {
    const checkSystem = jest.fn().mockRejectedValue(new Error('passengerId must be a UUID'))
    const provider = new F7Screening({ checkSystem } as unknown as ScreeningCheckService)
    await expect(provider.check(INPUT)).rejects.toThrow('passengerId must be a UUID')
  })
})
