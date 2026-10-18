// API for catering orders. Mirrors /staff/catering-orders and /staff/flights/:flightId/catering-order.

import { delay } from '../mocks/delay'
import { mockCateringOrders } from '../mocks/orders'
import type { CateringOrder } from './types'

export async function listCateringOrders(): Promise<CateringOrder[]> {
  await delay()
  return mockCateringOrders
}

export async function getCateringOrder(flightId: string): Promise<CateringOrder | null> {
  await delay()
  return mockCateringOrders.find((o) => o.flightId === flightId) ?? null
}
