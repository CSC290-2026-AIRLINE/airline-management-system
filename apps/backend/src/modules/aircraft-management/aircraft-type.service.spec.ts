import { BadRequestException, ConflictException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { AircraftTypeService } from './aircraft-type.service'
import type { CabinLayoutDto, SeatLayoutDto } from './dto/layout.dto'

// ESM-only dependencies that Jest cannot load here; the service under test never calls into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('AircraftTypeService', () => {
  let db: { aircraft_type: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock } }
  let service: AircraftTypeService

  const typeRow = {
    id: 't1',
    code: 'A320',
    manufacturer: 'Airbus',
    model: 'A320',
    layout: { cabins: [] },
    hold_weight_limit_kg: 9435,
    max_takeoff_weight_kg: 78000,
    max_range_km: 6100,
    min_turnaround_minutes: 45,
    operating_cost_per_hour: { toString: () => '5200.00' },
    cost_currency: 'USD',
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  }

  const cabin = (overrides: Partial<CabinLayoutDto> = {}): CabinLayoutDto => ({
    cabin_class: 'economy',
    first_row: 1,
    last_row: 10,
    columns: ['A', 'B', 'C'],
    ...overrides,
  })

  const layout = (cabins: CabinLayoutDto[]): SeatLayoutDto => ({ cabins })

  beforeEach(() => {
    db = {
      aircraft_type: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    }
    service = new AircraftTypeService(db as unknown as DbService)
  })

  it('reports the seat count of a layout', async () => {
    db.aircraft_type.findMany.mockResolvedValue([{ ...typeRow, layout: { cabins: [cabin()] } }])

    const [type] = await service.findAll()

    expect(type.total_seats).toBe(30)
  })

  it('rejects two cabins that share a row', async () => {
    const dto = {
      code: 'A320',
      manufacturer: 'Airbus',
      model: 'A320',
      layout: layout([cabin({ first_row: 1, last_row: 10 }), cabin({ first_row: 5, last_row: 20 })]),
      hold_weight_limit_kg: 9435,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6100,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 5200,
      cost_currency: 'USD',
    }

    await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException)
    expect(db.aircraft_type.create).not.toHaveBeenCalled()
  })

  it('rejects an aisle that is not a column of its cabin', async () => {
    const dto = {
      code: 'A320',
      manufacturer: 'Airbus',
      model: 'A320',
      layout: layout([cabin({ aisle_after: ['D'] })]),
      hold_weight_limit_kg: 9435,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6100,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 5200,
      cost_currency: 'USD',
    }

    await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException)
  })

  describe('layout limits', () => {
    const dtoWith = (cabins: CabinLayoutDto[]) => ({
      code: 'A320',
      manufacturer: 'Airbus',
      model: 'A320',
      layout: layout(cabins),
      hold_weight_limit_kg: 9435,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6100,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 5200,
      cost_currency: 'USD',
    })

    it.each([
      ['a layout with more seats than any aircraft has', [cabin({ last_row: 200, columns: ['A', 'B', 'C', 'D', 'E', 'F'] })]],
      ['a row type that does not exist', [cabin({ row_types: { window: [2] } })]],
      ['row types that list rows outside the cabin', [cabin({ row_types: { exit_row: [99] } })]],
      ['row types that are not a list of rows', [cabin({ row_types: { exit_row: 5 as unknown as number[] } })]],
      ['skipped rows outside the cabin', [cabin({ skip_rows: [50] })]],
      ['a blocked seat in a column the cabin does not have', [cabin({ blocked_seats: ['2Z'] })]],
      ['a blocked seat in a skipped row', [cabin({ skip_rows: [2], blocked_seats: ['2A'] })]],
      ['a blocked seat that is not a seat name', [cabin({ blocked_seats: ['seat'] })]],
    ])('rejects %s', async (_name, cabins) => {
      await expect(service.create(dtoWith(cabins))).rejects.toBeInstanceOf(BadRequestException)
      expect(db.aircraft_type.create).not.toHaveBeenCalled()
    })

    it('accepts row types, skipped rows and blocked seats that belong to the cabin', async () => {
      db.aircraft_type.findFirst.mockResolvedValue(null)
      db.aircraft_type.create.mockResolvedValue(typeRow)

      await service.create(dtoWith([cabin({ row_types: { exit_row: [4], extra_legroom: [1] }, skip_rows: [3], blocked_seats: ['2B'] })]))

      expect(db.aircraft_type.create).toHaveBeenCalled()
    })
  })

  it('stores the layout of a new type', async () => {
    db.aircraft_type.create.mockResolvedValue(typeRow)
    const dto = {
      code: 'a320',
      manufacturer: 'Airbus',
      model: 'A320',
      layout: layout([cabin()]),
      hold_weight_limit_kg: 9435,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6100,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 5200,
      cost_currency: 'usd',
    }

    const created = await service.create(dto)

    expect(db.aircraft_type.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'A320', cost_currency: 'USD' }) }),
    )
    expect(created.operating_cost_per_hour).toBe(5200)
  })

  it('reports a duplicate code as a conflict', async () => {
    db.aircraft_type.create.mockRejectedValue({ code: 'P2002' })
    const dto = {
      code: 'A320',
      manufacturer: 'Airbus',
      model: 'A320',
      layout: layout([cabin()]),
      hold_weight_limit_kg: 9435,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6100,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 5200,
      cost_currency: 'USD',
    }

    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException)
  })

  it('clones a type with the layout of the original', async () => {
    db.aircraft_type.findFirst.mockResolvedValueOnce({ ...typeRow, layout: { cabins: [cabin()] } }).mockResolvedValueOnce(null)
    db.aircraft_type.create.mockResolvedValue({ ...typeRow, id: 't2', code: 'A320-V2' })

    await service.clone('t1', { code: 'a320-v2' })

    expect(db.aircraft_type.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'A320-V2', layout: { cabins: [cabin()] } }),
      }),
    )
  })

  it('refuses to clone a type onto an existing code', async () => {
    db.aircraft_type.findFirst.mockResolvedValueOnce(typeRow).mockResolvedValueOnce({ ...typeRow, id: 't2' })

    await expect(service.clone('t1', { code: 'A320' })).rejects.toBeInstanceOf(ConflictException)
  })
})
