// OfferingsService: upsert + soft delete for the (product, route/flight,
// cabin) row that drives the Offered Menu. PUT-only — every change is
// a full replacement. Network scope means route_id + flight_id are
// both null; route scope means route_id is set; flight scope means
// flight_id is set. The unique constraint on (route_id, flight_id,
// cabin) means at most one default offering per scope/cabin.

import { Injectable } from '@nestjs/common'
import type { Prisma } from '../../../db/generated/prisma/client'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { resolveOfferings } from '../common/menu'
import type { F12Cabin } from '../common/mapping'

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
  copyInheritedMenu?: boolean
  allRouteCabins?: boolean
}

@Injectable()
export class OfferingsService {
  constructor(private readonly db: DbService) {}

  // The offered menu for a route and cabin. The filters are optional:
  // without them every offering is returned.
  async list(filter: { routeId?: string; cabin?: string } = {}): Promise<OfferingDto[]> {
    const rows = await this.db.product_offering.findMany({
      where: {
        deleted_at: null,
        ...(filter.routeId ? { route_id: filter.routeId } : {}),
        ...(filter.cabin ? { cabin: filter.cabin } : {}),
      },
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
    if (input.allRouteCabins && (input.scope !== 'route' || input.isDefault)) {
      throw new ApiErrorException('LINE_INVALID', 'Only route availability can be saved across cabins.', 400)
    }

    return this.db.$transaction(async (tx) => {
      if (!input.allRouteCabins) return this.saveOffering(tx, input)

      const isMeal = product.category === 'meal'
      const economy = await this.saveOffering(tx, { ...input, cabin: 'economy', copyInheritedMenu: true }, isMeal)
      const business = await this.saveOffering(tx, { ...input, cabin: 'business', copyInheritedMenu: true }, isMeal)
      return input.cabin === 'business' ? business : economy
    })
  }

  private async saveOffering(tx: Prisma.TransactionClient, input: OfferingInput, keepCabinDefault = false): Promise<OfferingDto> {
    const scope = {
      scope: input.scope,
      route_id: input.scope === 'route' ? (input.routeId ?? null) : null,
      flight_id: input.scope === 'flight' ? (input.flightId ?? null) : null,
      cabin: input.cabin,
    }
    const where = { ...scope, deleted_at: null }
    const rows = await tx.product_offering.findMany({ where })
    let isDefault = input.isDefault
    if (keepCabinDefault && input.isActive && rows.length > 0) {
      const currentDefault = rows.find((row) => row.is_default && row.is_active)
      isDefault = !currentDefault || currentDefault.product_id === input.productId
    }
    if (input.copyInheritedMenu && rows.length === 0 && input.scope !== 'network') {
      const flight = scope.flight_id
        ? await tx.flight.findUniqueOrThrow({ where: { id: scope.flight_id }, select: { route_id: true } })
        : null
      const routeId = scope.route_id ?? flight?.route_id ?? ''
      const candidates = await tx.product_offering.findMany({
        where: {
          cabin: scope.cabin,
          deleted_at: null,
          OR: [{ scope: 'network' }, { scope: 'route', route_id: routeId }],
        },
      })
      const menu = resolveOfferings(candidates.map(this.toDto) as Parameters<typeof resolveOfferings>[0], {
        flightId: scope.flight_id ?? '',
        routeId,
        cabin: scope.cabin as F12Cabin,
      })
      if (keepCabinDefault && input.isActive) {
        const currentDefault = menu.find((row) => row.isDefault)
        isDefault = !currentDefault || currentDefault.productId === input.productId
      }
      if (menu.length > 0) {
        await tx.product_offering.createMany({
          data: menu
            .filter((row) => row.productId !== input.productId)
            .map((row) => ({
              ...scope,
              product_id: row.productId,
              is_active: true,
              is_default: row.isDefault && !isDefault,
            })),
        })
      }
    }
    const existing = rows.find((row) => row.product_id === input.productId)
    if (isDefault) {
      await tx.product_offering.updateMany({ where: { ...where, is_default: true }, data: { is_default: false } })
    }
    const flags = { is_default: isDefault, is_active: input.isActive }
    const saved = existing
      ? await tx.product_offering.update({ where: { id: existing.id }, data: flags })
      : await tx.product_offering.create({ data: { ...scope, ...flags, product_id: input.productId } })
    return this.toDto(saved)
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
