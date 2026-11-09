import 'reflect-metadata'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { CreateAircraftTypeDto, UpdateAircraftTypeDto } from './dto/aircraft-type.dto'
import { CreateAircraftStatusDto } from './dto/aircraft.dto'

describe('Feature 9 — DTO Validation (Fix 4 & Fix 6)', () => {
  describe('Fix 4: Aircraft Type numbers must be >= 1 (not 0)', () => {
    it('rejects zero values for physical limit fields on create with validation error', async () => {
      const dto = plainToInstance(CreateAircraftTypeDto, {
        code: 'A320-TEST',
        manufacturer: 'Airbus',
        model: 'A320',
        hold_weight_limit_kg: 0,
        max_takeoff_weight_kg: 0,
        max_range_km: 0,
        min_turnaround_minutes: 0,
        operating_cost_per_hour: 1000,
        cost_currency: 'USD',
        layout: { cabins: [] },
      })

      const errors = await validate(dto)
      const propertiesWithErrors = errors.map((e) => e.property)

      expect(propertiesWithErrors).toContain('hold_weight_limit_kg')
      expect(propertiesWithErrors).toContain('max_takeoff_weight_kg')
      expect(propertiesWithErrors).toContain('max_range_km')
      expect(propertiesWithErrors).toContain('min_turnaround_minutes')
    })

    it('accepts positive values (>= 1)', async () => {
      const dto = plainToInstance(CreateAircraftTypeDto, {
        code: 'A320-TEST',
        manufacturer: 'Airbus',
        model: 'A320',
        hold_weight_limit_kg: 1000,
        max_takeoff_weight_kg: 50000,
        max_range_km: 3000,
        min_turnaround_minutes: 45,
        operating_cost_per_hour: 1000,
        cost_currency: 'USD',
        layout: { cabins: [] },
      })

      const errors = await validate(dto)
      const fieldErrors = errors.filter((e) =>
        ['hold_weight_limit_kg', 'max_takeoff_weight_kg', 'max_range_km', 'min_turnaround_minutes'].includes(e.property),
      )
      expect(fieldErrors).toHaveLength(0)
    })

    it('rejects zero values on update as well', async () => {
      const dto = plainToInstance(UpdateAircraftTypeDto, {
        max_range_km: 0,
        hold_weight_limit_kg: 0,
      })

      const errors = await validate(dto)
      const propertiesWithErrors = errors.map((e) => e.property)

      expect(propertiesWithErrors).toContain('max_range_km')
      expect(propertiesWithErrors).toContain('hold_weight_limit_kg')
    })
  })

  describe('Fix 6: Grounded status requires a reason', () => {
    it('rejects status grounded when reason is missing or empty', async () => {
      const dto = plainToInstance(CreateAircraftStatusDto, {
        status: 'grounded',
        start_date: '2026-11-10',
      })

      const errors = await validate(dto)
      const reasonError = errors.find((e) => e.property === 'reason')

      expect(reasonError).toBeDefined()
      expect(reasonError?.constraints?.isNotEmpty).toContain('reason is required when status is grounded')
    })

    it('accepts status grounded when reason is provided', async () => {
      const dto = plainToInstance(CreateAircraftStatusDto, {
        status: 'grounded',
        reason: 'Hydraulic system inspection',
        start_date: '2026-11-10',
      })

      const errors = await validate(dto)
      const reasonError = errors.find((e) => e.property === 'reason')

      expect(reasonError).toBeUndefined()
    })

    it('allows in_service status without a reason', async () => {
      const dto = plainToInstance(CreateAircraftStatusDto, {
        status: 'in_service',
        start_date: '2026-11-10',
      })

      const errors = await validate(dto)
      const reasonError = errors.find((e) => e.property === 'reason')

      expect(reasonError).toBeUndefined()
    })
  })
})
