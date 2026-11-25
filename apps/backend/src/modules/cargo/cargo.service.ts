import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { CreateCommodityTypeDto } from './dto/create-commodity-type.dto'
import type { UpdateCommodityTypeDto } from './dto/update-commodity-type.dto'
import type { CreateRateDto } from './dto/create-rate.dto'
import type { UpdateRateDto } from './dto/update-rate.dto'

@Injectable()
export class CargoService {
  constructor(private readonly db: DbService) {}

  // ── Commodity Types ───────────────────────────────────────────────

  listCommodityTypes() {
    return this.db.cargo_commodity_type.findMany({ orderBy: { name: 'asc' } })
  }

  async createCommodityType(dto: CreateCommodityTypeDto) {
    try {
      return await this.db.cargo_commodity_type.create({
        data: {
          name: dto.name,
          code: dto.code,
          handling_class: dto.handling_class,
          min_weight_kg: dto.min_weight_kg,
          max_weight_kg: dto.max_weight_kg,
          max_piece_weight_kg: dto.max_piece_weight_kg,
          ...(dto.is_active != null && { is_active: dto.is_active }),
        },
      })
    } catch (err: unknown) {
      if (isPrismaUniqueViolation(err)) {
        throw new ConflictException({ error: { code: 'DUPLICATE', message: 'A commodity type with this code already exists' } })
      }
      throw err
    }
  }

  async updateCommodityType(id: string, dto: UpdateCommodityTypeDto) {
    await this.requireCommodityType(id)

    try {
      return await this.db.cargo_commodity_type.update({
        where: { id },
        data: {
          ...(dto.name != null && { name: dto.name }),
          ...(dto.code != null && { code: dto.code }),
          ...(dto.handling_class != null && { handling_class: dto.handling_class }),
          ...(dto.min_weight_kg != null && { min_weight_kg: dto.min_weight_kg }),
          ...(dto.max_weight_kg != null && { max_weight_kg: dto.max_weight_kg }),
          ...(dto.max_piece_weight_kg != null && { max_piece_weight_kg: dto.max_piece_weight_kg }),
          ...(dto.is_active != null && { is_active: dto.is_active }),
          updated_at: new Date(),
        },
      })
    } catch (err: unknown) {
      if (isRecordNotFound(err)) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Commodity type ${id} not found` } })
      }
      if (isPrismaUniqueViolation(err)) {
        throw new ConflictException({ error: { code: 'DUPLICATE', message: 'A commodity type with this code already exists' } })
      }
      throw err
    }
  }

  // ── Rates ─────────────────────────────────────────────────────────

  listRates() {
    return this.db.cargo_rate.findMany({
      include: { cargo_commodity_type: true },
      orderBy: [{ commodity_type_id: 'asc' }, { min_distance_km: 'asc' }],
    })
  }

  async createRate(dto: CreateRateDto) {
    await this.requireCommodityType(dto.commodity_type_id)

    try {
      return await this.db.cargo_rate.create({
        data: {
          commodity_type_id: dto.commodity_type_id,
          min_distance_km: dto.min_distance_km,
          max_distance_km: dto.max_distance_km ?? null,
          rate_per_kg: dto.rate_per_kg,
          min_charge: dto.min_charge ?? 0,
          ...(dto.is_active != null && { is_active: dto.is_active }),
        },
        include: { cargo_commodity_type: true },
      })
    } catch (err: unknown) {
      if (isExclusionOrCheckViolation(err)) {
        throw new ConflictException({
          error: { code: 'OVERLAP', message: 'Distance band overlaps with an existing rate for this commodity type' },
        })
      }
      throw err
    }
  }

  async updateRate(id: string, dto: UpdateRateDto) {
    await this.requireRate(id)

    try {
      return await this.db.cargo_rate.update({
        where: { id },
        data: {
          ...(dto.commodity_type_id != null && { commodity_type_id: dto.commodity_type_id }),
          ...(dto.min_distance_km != null && { min_distance_km: dto.min_distance_km }),
          ...(dto.max_distance_km !== undefined && { max_distance_km: dto.max_distance_km ?? null }),
          ...(dto.rate_per_kg != null && { rate_per_kg: dto.rate_per_kg }),
          ...(dto.min_charge != null && { min_charge: dto.min_charge }),
          ...(dto.is_active != null && { is_active: dto.is_active }),
          updated_at: new Date(),
        },
        include: { cargo_commodity_type: true },
      })
    } catch (err: unknown) {
      if (isRecordNotFound(err)) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rate ${id} not found` } })
      }
      if (isExclusionOrCheckViolation(err)) {
        throw new ConflictException({
          error: { code: 'OVERLAP', message: 'Distance band overlaps with an existing rate for this commodity type' },
        })
      }
      throw err
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async requireCommodityType(id: string) {
    const row = await this.db.cargo_commodity_type.findUnique({ where: { id } })
    if (!row) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Commodity type ${id} not found` } })
    return row
  }

  private async requireRate(id: string) {
    const row = await this.db.cargo_rate.findUnique({ where: { id } })
    if (!row) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rate ${id} not found` } })
    return row
  }
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002'
}

function isRecordNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2025'
}

function isExclusionOrCheckViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as Record<string, unknown>
  const msg = typeof e.message === 'string' ? e.message : ''
  if (msg.includes('23P01') || msg.includes('23514')) return true
  const meta = e.meta as Record<string, unknown> | undefined
  const metaMsg = typeof meta?.message === 'string' ? meta.message : ''
  if (metaMsg.includes('23P01') || metaMsg.includes('23514')) return true
  if (metaMsg.includes('exclusion') || metaMsg.includes('violates check')) return true
  const cause = e.cause as Record<string, unknown> | undefined
  if (cause != null && typeof cause === 'object') {
    const causeCode = typeof cause.code === 'string' ? cause.code : ''
    if (causeCode === '23P01' || causeCode === '23514') return true
  }
  return false
}
