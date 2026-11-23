// The catering order list: the flights with their order status, for
// the staff picker. The flight-scoped routes live in the flights
// controller (/staff/flights/:flightId/...).

import { Controller, Get, Query } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffAuth } from '../common/staff-auth.decorator'
import { CateringOrdersService } from './catering-orders.service'

@Controller('staff/catering-orders')
@StaffAuth()
export class CateringOrdersController {
  constructor(private readonly orders: CateringOrdersService) {}

  @Get()
  async list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.orders.listOpenAndOrdered({
      ...(from ? { from: parseDate(from, 'from') } : {}),
      ...(to ? { to: parseDate(to, 'to') } : {}),
    })
  }
}

// A date filter is an ISO date or date-time.
function parseDate(value: string, name: string): Date {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    throw new ApiErrorException('LINE_INVALID', `${name} must be an ISO date.`, 400)
  }
  return new Date(parsed)
}
