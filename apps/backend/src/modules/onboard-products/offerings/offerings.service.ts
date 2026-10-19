// OfferingsService: upsert + soft delete for the (product, route/flight,
// cabin) row that drives the Offered Menu. PUT-only — every change is
// a full replacement. Network scope means route_id + flight_id are
// both null; route scope means route_id is set; flight scope means
// flight_id is set. The unique constraint on (route_id, flight_id,
// cabin) means at most one default offering per scope/cabin.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'

export interface OfferingDto {
  id: string
  productId: string
  scope: 'network' | 'route' | 'flight'
  routeId: string | null
  flightId: string | null
  cabin: string
  isDefault: boolean
  isActive: boolean
}

export interface OfferingInput {
  productId: string
  scope: 'network' | 'route' | 'flight'
  routeId?: string | null
  flightId?: string | null
  cabin: string
  isDefault: boolean
  isActive: boolean
}

@Injectable()
export class OfferingsService {
  constructor(private readonly db: DbService) {}

  async list(): Promise<OfferingDto[]> {
    const rows = await this.db.product_offering.findMany({
      where: { deleted_at: null },
      orderBy: [{ scope: 'asc' }, { cabin: 'asc' }],
    })
    return rows.map(this.toDto)
  }

  async upsert(input: OfferingInput): Promise<OfferingDto> {
    const product = await this.db.product.findFirst({ where: { id: input.productId, deleted_at: null } })
    if (!product) throw new ApiErrorException('NOT_FOUND', 'Product not found.', 404)
    if (input.scope === 'route' && !input.routeId) {
      throw new ApiErrorException('LINE_INVALID', 'routeId is required for route-scope offerings.', 400)
    }
    if (input.scope === 'flight' && !input.flightId) {
      throw new ApiErrorException('LINE_INVALID', 'flightId is required for flight-scope offerings.', 400)
    }
    // The unique key in the DB is (route_id, flight_id, cabin) with the
    // partial index on is_default+deleted_at, plus (product_id, route_id,
    // flight_id, cabin) with deleted_at IS NULL. We look up by the
    // latter and update / create accordingly.
    const existing = await this.db.product_offering.findFirst({
      where: {
        product_id: input.productId,
        route_id: input.scope === 'route' ? (input.routeId ?? null) : null,
        flight_id: input.scope === 'flight' ? (input.flightId ?? null) : null,
        cabin: input.cabin,
        deleted_at: null,
      },
    })
    if (existing) {
      const updated = await this.db.product_offering.update({
        where: { id: existing.id },
        data: { is_default: input.isDefault, is_active: input.isActive },
      })
      return this.toDto(updated)
    }
    const created = await this.db.product_offering.create({
      data: {
        product_id: input.productId,
        scope: input.scope,
        route_id: input.scope === 'route' ? (input.routeId ?? null) : null,
        flight_id: input.scope === 'flight' ? (input.flightId ?? null) : null,
        cabin: input.cabin,
        is_default: input.isDefault,
        is_active: input.isActive,
      },
    })
    return this.toDto(created)
  }

  async remove(id: string): Promise<void> {
    const existing = await this.db.product_offering.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Offering not found.', 404)
    await this.db.product_offering.update({ where: { id }, data: { deleted_at: new Date() } })
  }

  async toggle(id: string, patch: { isActive?: boolean; isDefault?: boolean }): Promise<OfferingDto> {
    const existing = await this.db.product_offering.findFirst({ where: { id, deleted_at: null } })
    if (!existing) throw new ApiErrorException('NOT_FOUND', 'Offering not found.', 404)
    const updated = await this.db.product_offering.update({
      where: { id },
      data: {
        ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
        ...(patch.isDefault !== undefined ? { is_default: patch.isDefault } : {}),
      },
    })
    return this.toDto(updated)
  }

  private toDto = (row: {
    id: string
    product_id: string
    scope: string
    route_id: string | null
    flight_id: string | null
    cabin: string
    is_default: boolean
    is_active: boolean
  }): OfferingDto => ({
    id: row.id,
    productId: row.product_id,
    scope: row.scope as OfferingDto['scope'],
    routeId: row.route_id,
    flightId: row.flight_id,
    cabin: row.cabin,
    isDefault: row.is_default,
    isActive: row.is_active,
  })
}
