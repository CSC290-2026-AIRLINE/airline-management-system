import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, isUniqueViolation, pricingError } from '../pricing.errors'
import { CreateBaseFareDto } from './dto/create-base-fare.dto'
import { ListBaseFaresDto } from './dto/list-base-fares.dto'
import { UpdateBaseFareDto } from './dto/update-base-fare.dto'

// Enough of the route and fare class for a staff list to show "BKK → CNX, Y (Economy)" without more calls.
const INCLUDE_LABELS = {
  route: { select: { origin: true, destination: true } },
  fare_class: { select: { code: true, name: true, cabin: true } },
} as const

@Injectable()
export class BaseFareService {
  constructor(private readonly db: DbService) {}

  findAll(filter: ListBaseFaresDto = {}) {
    return this.db.base_fare.findMany({
      where: { deleted_at: null, ...filter },
      include: INCLUDE_LABELS,
      orderBy: [{ route_id: 'asc' }, { fare_class_id: 'asc' }],
    })
  }

  async findOne(id: string) {
    const baseFare = await this.db.base_fare.findFirst({ where: { id, deleted_at: null }, include: INCLUDE_LABELS })
    if (!baseFare) {
      throw new NotFoundException(pricingError(PricingErrorCode.BASE_FARE_NOT_FOUND, `Base fare ${id} not found`))
    }
    return baseFare
  }

  async create(dto: CreateBaseFareDto) {
    await this.assertRouteExists(dto.route_id)
    await this.assertFareClassLive(dto.fare_class_id)
    await this.assertPairFree(dto.route_id, dto.fare_class_id)
    try {
      return await this.db.base_fare.create({ data: dto, include: INCLUDE_LABELS })
    } catch (error) {
      throw this.mapUniqueViolation(error)
    }
  }

  async update(id: string, dto: UpdateBaseFareDto) {
    await this.findOne(id)
    return this.db.base_fare.update({ where: { id }, data: { ...dto, updated_at: new Date() }, include: INCLUDE_LABELS })
  }

  // Soft delete: quotes already made from this fare keep their own frozen lines.
  async remove(id: string) {
    await this.findOne(id)
    const now = new Date()
    await this.db.base_fare.update({ where: { id }, data: { deleted_at: now, updated_at: now } })
  }

  // `route` belongs to Feature 2 and is only read here. Switch to their exported service once it exists.
  private async assertRouteExists(routeId: string) {
    const route = await this.db.route.findUnique({ where: { id: routeId }, select: { id: true } })
    if (!route) {
      throw new NotFoundException(pricingError(PricingErrorCode.ROUTE_NOT_FOUND, `Route ${routeId} not found`))
    }
  }

  private async assertFareClassLive(fareClassId: string) {
    const fareClass = await this.db.fare_class.findFirst({ where: { id: fareClassId, deleted_at: null }, select: { id: true } })
    if (!fareClass) {
      throw new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, `Fare class ${fareClassId} not found`))
    }
  }

  private async assertPairFree(routeId: string, fareClassId: string) {
    const existing = await this.db.base_fare.findFirst({
      where: { route_id: routeId, fare_class_id: fareClassId, deleted_at: null },
      select: { id: true },
    })
    if (existing) {
      throw this.pairTaken(existing.id)
    }
  }

  // Two requests can both pass assertPairFree; the partial unique index catches the second one (P2002).
  private mapUniqueViolation(error: unknown) {
    return isUniqueViolation(error) ? this.pairTaken() : error
  }

  private pairTaken(existingId?: string) {
    return new ConflictException(
      pricingError(
        PricingErrorCode.BASE_FARE_EXISTS,
        'This route already has a base fare for this fare class',
        existingId ? { base_fare_id: existingId } : undefined,
      ),
    )
  }
}
