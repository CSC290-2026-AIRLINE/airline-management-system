import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { CloneAircraftTypeDto, CreateAircraftTypeDto, UpdateAircraftTypeDto } from './dto/aircraft-type.dto'
import { CABIN_CLASSES, type CabinLayout, type SeatLayout } from './dto/layout.dto'
import { countLayoutSeats } from './seat-map'
import { hasPrismaErrorCode, PRISMA_UNIQUE_VIOLATION } from './prisma-error'

export type AircraftTypeSummary = {
  id: string
  code: string
  manufacturer: string
  model: string
  layout: SeatLayout
  total_seats: number
  hold_weight_limit_kg: number
  max_takeoff_weight_kg: number
  max_range_km: number
  min_turnaround_minutes: number
  operating_cost_per_hour: number
  cost_currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type AircraftTypeUpdate = {
  code?: string
  manufacturer?: string
  model?: string
  hold_weight_limit_kg?: number
  max_takeoff_weight_kg?: number
  max_range_km?: number
  min_turnaround_minutes?: number
  operating_cost_per_hour?: number
  cost_currency?: string
  is_active?: boolean
  updated_at: Date
}

@Injectable()
export class AircraftTypeService {
  constructor(private readonly db: DbService) {}

  async findAll(): Promise<AircraftTypeSummary[]> {
    const types = await this.db.aircraft_type.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    })
    return types.map((type) => this.toSummary(type))
  }

  async findOne(id: string): Promise<AircraftTypeSummary> {
    const type = await this.db.aircraft_type.findFirst({ where: { id, deleted_at: null } })
    if (!type) {
      throw new NotFoundException(`Aircraft type with ID ${id} not found`)
    }
    return this.toSummary(type)
  }

  async create(dto: CreateAircraftTypeDto): Promise<AircraftTypeSummary> {
    const layout = this.validateLayout(dto.layout.cabins)
    const code = dto.code.trim().toUpperCase()

    try {
      const created = await this.db.aircraft_type.create({
        data: {
          code,
          manufacturer: dto.manufacturer.trim(),
          model: dto.model.trim(),
          layout,
          hold_weight_limit_kg: dto.hold_weight_limit_kg,
          max_takeoff_weight_kg: dto.max_takeoff_weight_kg,
          max_range_km: dto.max_range_km,
          min_turnaround_minutes: dto.min_turnaround_minutes,
          operating_cost_per_hour: dto.operating_cost_per_hour,
          cost_currency: dto.cost_currency.trim().toUpperCase(),
          is_active: dto.is_active ?? true,
        },
      })
      return this.toSummary(created)
    } catch (error) {
      if (hasPrismaErrorCode(error, PRISMA_UNIQUE_VIOLATION)) {
        throw new ConflictException(`Aircraft type with code "${code}" already exists`)
      }
      throw error
    }
  }

  async update(id: string, dto: UpdateAircraftTypeDto): Promise<AircraftTypeSummary> {
    await this.findOne(id)

    const data: AircraftTypeUpdate = { updated_at: new Date() }
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase()
    if (dto.manufacturer !== undefined) data.manufacturer = dto.manufacturer.trim()
    if (dto.model !== undefined) data.model = dto.model.trim()
    if (dto.hold_weight_limit_kg !== undefined) data.hold_weight_limit_kg = dto.hold_weight_limit_kg
    if (dto.max_takeoff_weight_kg !== undefined) data.max_takeoff_weight_kg = dto.max_takeoff_weight_kg
    if (dto.max_range_km !== undefined) data.max_range_km = dto.max_range_km
    if (dto.min_turnaround_minutes !== undefined) data.min_turnaround_minutes = dto.min_turnaround_minutes
    if (dto.operating_cost_per_hour !== undefined) data.operating_cost_per_hour = dto.operating_cost_per_hour
    if (dto.cost_currency !== undefined) data.cost_currency = dto.cost_currency.trim().toUpperCase()
    if (dto.is_active !== undefined) data.is_active = dto.is_active

    try {
      const updated = await this.db.aircraft_type.update({ where: { id }, data })
      return this.toSummary(updated)
    } catch (error) {
      if (hasPrismaErrorCode(error, PRISMA_UNIQUE_VIOLATION)) {
        throw new ConflictException(`Aircraft type with code "${dto.code ?? ''}" already exists`)
      }
      throw error
    }
  }

  /** Cloning is how a new layout is introduced: the layout of an existing type is never edited. */
  async clone(id: string, dto: CloneAircraftTypeDto): Promise<AircraftTypeSummary> {
    const existing = await this.findOne(id)
    const code = dto.code.trim().toUpperCase()

    const clone = await this.db.aircraft_type.findFirst({ where: { code, deleted_at: null } })
    if (clone) {
      throw new ConflictException(`Aircraft type with code "${code}" already exists`)
    }

    const layout = dto.layout ? this.validateLayout(dto.layout.cabins) : existing.layout

    try {
      const created = await this.db.aircraft_type.create({
        data: {
          code,
          manufacturer: existing.manufacturer,
          model: existing.model,
          layout,
          hold_weight_limit_kg: existing.hold_weight_limit_kg,
          max_takeoff_weight_kg: existing.max_takeoff_weight_kg,
          max_range_km: existing.max_range_km,
          min_turnaround_minutes: existing.min_turnaround_minutes,
          operating_cost_per_hour: existing.operating_cost_per_hour,
          cost_currency: existing.cost_currency,
          is_active: existing.is_active,
        },
      })
      return this.toSummary(created)
    } catch (error) {
      if (hasPrismaErrorCode(error, PRISMA_UNIQUE_VIOLATION)) {
        throw new ConflictException(`Aircraft type with code "${code}" already exists`)
      }
      throw error
    }
  }

  /**
   * Layout rules that the DTO cannot express: the cabin classes have to be known, every cabin needs
   * columns, aisles have to point at a real column, and two cabins may not share a row.
   */
  private validateLayout(cabins: CabinLayout[]): SeatLayout {
    if (!Array.isArray(cabins) || cabins.length === 0) {
      throw new BadRequestException('layout must have a non-empty cabins array')
    }

    for (const cabin of cabins) {
      if (!CABIN_CLASSES.includes(cabin.cabin_class)) {
        throw new BadRequestException(`Invalid cabin_class "${cabin.cabin_class}"`)
      }
      if (cabin.first_row > cabin.last_row) {
        throw new BadRequestException('first_row cannot be greater than last_row')
      }
      if (cabin.columns.length === 0) {
        throw new BadRequestException('columns must be a non-empty array')
      }
      if (new Set(cabin.columns).size !== cabin.columns.length) {
        throw new BadRequestException('columns must be distinct')
      }
      for (const aisle of cabin.aisle_after ?? []) {
        if (!cabin.columns.includes(aisle)) {
          throw new BadRequestException(`aisle_after "${aisle}" is not in columns`)
        }
      }
    }

    const sorted = [...cabins].sort((left, right) => left.first_row - right.first_row)
    for (let index = 1; index < sorted.length; index++) {
      if (sorted[index].first_row <= sorted[index - 1].last_row) {
        throw new BadRequestException('Cabin row ranges must not overlap')
      }
    }

    return { cabins: sorted }
  }

  private toSummary(type: {
    id: string
    code: string
    manufacturer: string
    model: string
    layout: unknown
    hold_weight_limit_kg: number
    max_takeoff_weight_kg: number
    max_range_km: number
    min_turnaround_minutes: number
    operating_cost_per_hour: { toString(): string }
    cost_currency: string
    is_active: boolean
    created_at: Date
    updated_at: Date
  }): AircraftTypeSummary {
    const layout = (type.layout ?? { cabins: [] }) as SeatLayout
    return {
      id: type.id,
      code: type.code,
      manufacturer: type.manufacturer,
      model: type.model,
      layout,
      total_seats: countLayoutSeats(layout),
      hold_weight_limit_kg: type.hold_weight_limit_kg,
      max_takeoff_weight_kg: type.max_takeoff_weight_kg,
      max_range_km: type.max_range_km,
      min_turnaround_minutes: type.min_turnaround_minutes,
      operating_cost_per_hour: Number(type.operating_cost_per_hour),
      cost_currency: type.cost_currency,
      is_active: type.is_active,
      created_at: type.created_at.toISOString(),
      updated_at: type.updated_at.toISOString(),
    }
  }
}
