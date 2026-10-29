import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { CreateBaggageRateDto } from './dto/create-baggage-rate.dto'
import { ListBaggageRatesDto } from './dto/list-baggage-rates.dto'
import { UpdateBaggageRateDto } from './dto/update-baggage-rate.dto'

// Enough of the fare class and route for a staff list to show "Y (Economy), BKK → NRT" without more calls.
const INCLUDE_LABELS = {
  fare_class: { select: { code: true, name: true, cabin: true } },
  route: { select: { origin: true, destination: true } },
} as const

@Injectable()
export class BaggageRateService {
  constructor(private readonly db: DbService) {}

  findAll(filter: ListBaggageRatesDto = {}) {
    return this.db.overweight_baggage_rate.findMany({
      where: { deleted_at: null, ...filter },
      include: INCLUDE_LABELS,
      orderBy: [{ fare_class_id: 'asc' }, { route_id: { sort: 'asc', nulls: 'first' } }],
    })
  }

  async findOne(id: string) {
    const rate = await this.db.overweight_baggage_rate.findFirst({ where: { id, deleted_at: null }, include: INCLUDE_LABELS })
    if (!rate) {
      throw new NotFoundException(pricingError(PricingErrorCode.BAGGAGE_RATE_NOT_FOUND, `Baggage rate ${id} not found`))
    }
    return rate
  }

  async create(dto: CreateBaggageRateDto) {
    const routeId = dto.route_id ?? null
    this.assertAllowanceBelowMax(dto.free_allowance_kg, dto.max_bag_kg ?? null)
    await this.assertFareClassLive(dto.fare_class_id)
    if (routeId) {
      await this.assertRouteExists(routeId)
    }
    await this.assertPairFree(dto.fare_class_id, routeId)
    try {
      return await this.db.overweight_baggage_rate.create({ data: { ...dto, route_id: routeId }, include: INCLUDE_LABELS })
    } catch (error) {
      throw this.mapUniqueViolation(error)
    }
  }

  async update(id: string, dto: UpdateBaggageRateDto) {
    const existing = await this.findOne(id)
    // Check the final combination, not just the fields that were sent.
    const fareClassId = dto.fare_class_id ?? existing.fare_class_id
    const routeId = dto.route_id === undefined ? existing.route_id : dto.route_id
    const freeAllowance = dto.free_allowance_kg ?? Number(existing.free_allowance_kg)
    const maxBag = dto.max_bag_kg === undefined ? toNumberOrNull(existing.max_bag_kg) : dto.max_bag_kg
    this.assertAllowanceBelowMax(freeAllowance, maxBag)
    if (dto.fare_class_id) {
      await this.assertFareClassLive(fareClassId)
    }
    if (dto.route_id) {
      await this.assertRouteExists(dto.route_id)
    }
    if (dto.fare_class_id !== undefined || dto.route_id !== undefined) {
      await this.assertPairFree(fareClassId, routeId, id)
    }
    try {
      return await this.db.overweight_baggage_rate.update({
        where: { id },
        data: { ...dto, updated_at: new Date() },
        include: INCLUDE_LABELS,
      })
    } catch (error) {
      throw this.mapUniqueViolation(error)
    }
  }

  // Soft delete: the same fare class + route can be added again afterwards (the unique index only covers live rows).
  async remove(id: string) {
    await this.findOne(id)
    const now = new Date()
    await this.db.overweight_baggage_rate.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  // Charge for one bag: a rate for this route wins, otherwise the fare class default (route_id null).
  async calculateCharge(fareClassId: string, weightKg: number, routeId?: string) {
    const rate = (routeId && (await this.findLiveRate(fareClassId, routeId))) || (await this.findLiveRate(fareClassId, null))
    if (!rate) {
      throw new NotFoundException(
        pricingError(PricingErrorCode.BAGGAGE_RATE_NOT_FOUND, `No baggage rate for fare class ${fareClassId}`, {
          fare_class_id: fareClassId,
          ...(routeId && { route_id: routeId }),
        }),
      )
    }

    const freeAllowanceKg = Number(rate.free_allowance_kg)
    const ratePerKg = Number(rate.rate_per_kg)
    const maxBagKg = toNumberOrNull(rate.max_bag_kg)
    // Too heavy is refused, not charged: the bag has to go as cargo.
    if (maxBagKg !== null && weightKg > maxBagKg) {
      throw new UnprocessableEntityException(
        pricingError(PricingErrorCode.BAGGAGE_TOO_HEAVY, `A bag of ${weightKg} kg is over the ${maxBagKg} kg limit and must go as cargo`, {
          weight_kg: weightKg,
          max_bag_kg: maxBagKg,
        }),
      )
    }

    const chargeableKg = chargeableKgFor(weightKg, freeAllowanceKg)
    return {
      baggage_rate_id: rate.id,
      fare_class_id: rate.fare_class_id,
      route_id: rate.route_id,
      weight_kg: weightKg,
      free_allowance_kg: freeAllowanceKg,
      max_bag_kg: maxBagKg,
      rate_per_kg: ratePerKg,
      chargeable_kg: chargeableKg,
      charge: Math.round(chargeableKg * ratePerKg * 100) / 100,
    }
  }

  private findLiveRate(fareClassId: string, routeId: string | null) {
    return this.db.overweight_baggage_rate.findFirst({
      where: { fare_class_id: fareClassId, route_id: routeId, is_active: true, deleted_at: null },
    })
  }

  private assertAllowanceBelowMax(freeAllowanceKg: number, maxBagKg: number | null) {
    if (maxBagKg !== null && freeAllowanceKg >= maxBagKg) {
      throw new BadRequestException(
        pricingError(
          PricingErrorCode.BAGGAGE_RATE_INVALID,
          `free_allowance_kg (${freeAllowanceKg}) must be less than max_bag_kg (${maxBagKg})`,
        ),
      )
    }
  }

  private async assertFareClassLive(fareClassId: string) {
    const fareClass = await this.db.fare_class.findFirst({ where: { id: fareClassId, deleted_at: null }, select: { id: true } })
    if (!fareClass) {
      throw new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, `Fare class ${fareClassId} not found`))
    }
  }

  // `route` belongs to Feature 2 and is only read here. Switch to their exported service once it exists.
  private async assertRouteExists(routeId: string) {
    const route = await this.db.route.findUnique({ where: { id: routeId }, select: { id: true } })
    if (!route) {
      throw new NotFoundException(pricingError(PricingErrorCode.ROUTE_NOT_FOUND, `Route ${routeId} not found`))
    }
  }

  // An empty route counts as a value (NULLS NOT DISTINCT in the index), so a fare class has at most one default.
  private async assertPairFree(fareClassId: string, routeId: string | null, excludeId?: string) {
    const existing = await this.db.overweight_baggage_rate.findFirst({
      where: { fare_class_id: fareClassId, route_id: routeId, deleted_at: null, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true },
    })
    if (existing) {
      throw this.pairTaken(routeId, existing.id)
    }
  }

  // Two requests can both pass assertPairFree; the partial unique index catches the second one (P2002).
  private mapUniqueViolation(error: unknown) {
    return isUniqueViolation(error) ? this.pairTaken(null) : error
  }

  private pairTaken(routeId: string | null, existingId?: string) {
    const message = routeId
      ? 'This fare class already has a baggage rate for this route'
      : 'This fare class already has a default baggage rate'
    return new ConflictException(
      pricingError(PricingErrorCode.BAGGAGE_RATE_EXISTS, message, existingId ? { baggage_rate_id: existingId } : undefined),
    )
  }
}

function toNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

// Extra weight rounded UP to a whole kg; 0 when the bag is within the allowance.
// Rounded to 0.001 first so float noise (25.4 - 20 = 5.399999...) cannot push a whole number up a kg.
export function chargeableKgFor(weightKg: number, freeAllowanceKg: number): number {
  const extraKg = Math.round((weightKg - freeAllowanceKg) * 1000) / 1000
  return extraKg <= 0 ? 0 : Math.ceil(extraKg)
}
