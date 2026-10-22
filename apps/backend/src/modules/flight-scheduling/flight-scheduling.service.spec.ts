import { BadRequestException } from '@nestjs/common'
import { FlightSchedulingService } from './flight-scheduling.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

describe('FlightSchedulingService.listFlights', () => {
  const findMany = jest.fn()
  const service = new FlightSchedulingService({ flight: { findMany } } as never)

  beforeEach(() => findMany.mockReset())

  it.each([
    { status: 'bogus' },
    { route_id: 'nope' },
    { cursor: 'nope' },
    { service_date: '2026-13-40' },
    { service_date: '2026-02-30' },
    { service_date: '22-10-2026' },
    { limit: '0' },
    { limit: '101' },
    { limit: 'abc' },
  ])('rejects %j', async (query) => {
    await expect(service.listFlights(query)).rejects.toBeInstanceOf(BadRequestException)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('returns nextCursor and trims the extra row when another page exists', async () => {
    findMany.mockResolvedValue([{ id: ID(1) }, { id: ID(2) }, { id: ID(3) }])
    const result = await service.listFlights({ limit: '2' })
    expect(result).toEqual({ data: [{ id: ID(1) }, { id: ID(2) }], nextCursor: ID(2) })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }))
  })

  it('returns null nextCursor on the last page and passes filters and cursor to Prisma', async () => {
    findMany.mockResolvedValue([{ id: ID(3) }])
    const result = await service.listFlights({ status: 'delayed', service_date: '2026-10-22', cursor: ID(2) })
    expect(result.nextCursor).toBeNull()
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'delayed', route_id: undefined, service_date: new Date('2026-10-22T00:00:00Z') },
        cursor: { id: ID(2) },
        skip: 1,
        take: 21,
      }),
    )
  })
})
