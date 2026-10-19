// Offerings HTTP surface under /api/staff/product-offerings.
// PUT-only mutations per the F12 spec. Toggle a single offering via
// /:id (isActive and/or isDefault). Soft delete via DELETE.

import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffGuard } from '../common/staff.guard'
import { OfferingsService, type OfferingInput } from './offerings.service'

function parseUpsert(body: unknown): OfferingInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('LINE_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.productId !== 'string') throw new ApiErrorException('LINE_INVALID', 'productId is required.', 400)
  if (b.scope !== 'network' && b.scope !== 'route' && b.scope !== 'flight') {
    throw new ApiErrorException('LINE_INVALID', 'scope must be network, route or flight.', 400)
  }
  if (typeof b.cabin !== 'string') throw new ApiErrorException('LINE_INVALID', 'cabin is required.', 400)
  if (typeof b.isDefault !== 'boolean') throw new ApiErrorException('LINE_INVALID', 'isDefault must be a boolean.', 400)
  if (typeof b.isActive !== 'boolean') throw new ApiErrorException('LINE_INVALID', 'isActive must be a boolean.', 400)
  if (b.scope === 'route' && typeof b.routeId !== 'string') {
    throw new ApiErrorException('LINE_INVALID', 'routeId is required when scope=route.', 400)
  }
  if (b.scope === 'flight' && typeof b.flightId !== 'string') {
    throw new ApiErrorException('LINE_INVALID', 'flightId is required when scope=flight.', 400)
  }
  return {
    productId: b.productId,
    scope: b.scope,
    routeId: b.scope === 'route' ? (b.routeId as string) : null,
    flightId: b.scope === 'flight' ? (b.flightId as string) : null,
    cabin: b.cabin,
    isDefault: b.isDefault,
    isActive: b.isActive,
  }
}

function parseToggle(body: unknown): { isActive?: boolean; isDefault?: boolean } {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('LINE_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  const out: { isActive?: boolean; isDefault?: boolean } = {}
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== 'boolean') throw new ApiErrorException('LINE_INVALID', 'isActive must be a boolean.', 400)
    out.isActive = b.isActive
  }
  if (b.isDefault !== undefined) {
    if (typeof b.isDefault !== 'boolean') throw new ApiErrorException('LINE_INVALID', 'isDefault must be a boolean.', 400)
    out.isDefault = b.isDefault
  }
  if (out.isActive === undefined && out.isDefault === undefined) {
    throw new ApiErrorException('LINE_INVALID', 'Provide isActive and/or isDefault.', 400)
  }
  return out
}

@Controller('staff/product-offerings')
@UseGuards(StaffGuard)
export class OfferingsController {
  constructor(private readonly offerings: OfferingsService) {}

  @Get()
  async list() {
    return this.offerings.list()
  }

  @Put()
  async upsert(@Body() body: unknown) {
    return this.offerings.upsert(parseUpsert(body))
  }

  @Put(':id')
  async toggle(@Param('id') id: string, @Body() body: unknown) {
    return this.offerings.toggle(id, parseToggle(body))
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.offerings.remove(id)
  }
}
