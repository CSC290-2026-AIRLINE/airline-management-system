import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { DbService } from '../../db/db.service'
import { CreateAircraftTypeDto } from '../dto/create-aircraft-type.dto'
import { UpdateAircraftTypeDto } from '../dto/update-aircraft-type.dto'

@Injectable()
export class AircraftTypeService {
  constructor(private readonly db: DbService) {}

  // Validate JSON layout structure
  validateLayout(layout: any) {
    if (
      !layout ||
      !layout.cabins ||
      !Array.isArray(layout.cabins) ||
      layout.cabins.length === 0
    ) {
      throw new BadRequestException(
        'layout must have a non-empty cabins array',
      )
    }
    const validClasses = ['first', 'business', 'premium_economy', 'economy']
    for (const cabin of layout.cabins) {
      if (!validClasses.includes(cabin.cabin_class)) {
        throw new BadRequestException(
          `Invalid cabin_class "${cabin.cabin_class}"`,
        )
      }
      if (
        typeof cabin.first_row !== 'number' ||
        typeof cabin.last_row !== 'number'
      ) {
        throw new BadRequestException('first_row and last_row must be numbers')
      }
      if (cabin.first_row > cabin.last_row) {
        throw new BadRequestException(
          'first_row cannot be greater than last_row',
        )
      }
      if (!Array.isArray(cabin.columns) || cabin.columns.length === 0) {
        throw new BadRequestException('columns must be a non-empty array')
      }
      // Check columns are distinct capital letters
      const colSet = new Set(cabin.columns)
      if (colSet.size !== cabin.columns.length) {
        throw new BadRequestException('columns must be distinct')
      }
      for (const col of cabin.columns) {
        if (!/^[A-Z]$/.test(col)) {
          throw new BadRequestException(
            `Column "${col}" must be a single capital letter`,
          )
        }
      }
      // aisle_after must be among columns
      if (cabin.aisle_after) {
        for (const a of cabin.aisle_after) {
          if (!cabin.columns.includes(a)) {
            throw new BadRequestException(
              `aisle_after "${a}" is not in columns`,
            )
          }
        }
      }
    }
    // Check cabins don't overlap rows
    const sortedCabins = [...layout.cabins].sort(
      (a: any, b: any) => a.first_row - b.first_row,
    )
    for (let i = 1; i < sortedCabins.length; i++) {
      if (sortedCabins[i].first_row <= sortedCabins[i - 1].last_row) {
        throw new BadRequestException('Cabin row ranges must not overlap')
      }
    }
  }

  async create(data: CreateAircraftTypeDto) {
    this.validateLayout(data.layout)
    return this.db.aircraft_type.create({ data })
  }

  async findAll() {
    return this.db.aircraft_type.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    })
  }

  async findOne(id: string) {
    const aircraftType = await this.db.aircraft_type.findFirst({
      where: { id, deleted_at: null },
    })
    if (!aircraftType) {
      throw new NotFoundException(`Aircraft type with ID ${id} not found`)
    }
    return aircraftType
  }

  async update(id: string, data: UpdateAircraftTypeDto) {
    const existing = await this.findOne(id)
    // layout cannot be changed
    if (data.layout !== undefined) {
      throw new BadRequestException(
        'layout cannot be changed; create a new aircraft type or use clone',
      )
    }
    return this.db.aircraft_type.update({
      where: { id },
      data: {
        ...data,
        layout: undefined, // ensure layout is never updated
        updated_at: new Date(),
      },
    })
  }

  async clone(id: string, newCode: string, newLayout?: any) {
    const existing = await this.findOne(id)

    // Check code uniqueness
    const codeExists = await this.db.aircraft_type.findFirst({
      where: { code: newCode, deleted_at: null },
    })
    if (codeExists) {
      throw new ConflictException(
        `Aircraft type with code "${newCode}" already exists`,
      )
    }

    const layout = newLayout || existing.layout
    this.validateLayout(layout)

    return this.db.aircraft_type.create({
      data: {
        code: newCode,
        manufacturer: existing.manufacturer,
        model: existing.model,
        layout,
        hold_weight_limit_kg: existing.hold_weight_limit_kg,
        max_takeoff_weight_kg: existing.max_takeoff_weight_kg,
        max_range_km: existing.max_range_km,
        min_turnaround_minutes: existing.min_turnaround_minutes,
        operating_cost_per_hour: existing.operating_cost_per_hour,
        cost_currency: existing.cost_currency,
      },
    })
  }
}
