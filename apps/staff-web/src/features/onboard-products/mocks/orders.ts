// Mock data for catering orders (master-detail screen) and the flight
// list the left card shows. The store is module-level mutable so the
// Catering Orders page and the Stock page share the same warehouse_stock
// numbers through `getAvailableStock`.

import { MOCK_NOW_ISO } from './clock'
import { getAvailableStock } from './stock'
import type { CateringOrder, Flight } from '../api/types'

// -- Flights ----------------------------------------------------------------
// The Catering Orders left card shows every flight in a 2-week window, not
// just the ones that already have a catering order. The right card looks up
// the matching order on demand. Status 'open' means no catering order yet.

function cutoff(departureIso: string): string {
  const d = new Date(departureIso)
  d.setUTCHours(d.getUTCHours() - 48)
  return d.toISOString()
}

export const mockFlights: Flight[] = [
  // Today is MOCK_NOW_ISO = 2026-10-08T09:00:00Z. Cutoff is dep - 48h.
  {
    id: 'f-308',
    flightNumber: 'FL308',
    routeId: 'r-bkk-nrt',
    scheduledDeparture: '2026-10-09T09:40:00Z',
    departureAirport: 'BKK',
    arrivalAirport: 'NRT',
    passengerCount: 212,
    aircraftId: 'a-fya',
    status: 'generated',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-09T09:40:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-308b',
    flightNumber: 'FL308',
    routeId: 'r-bkk-nrt',
    scheduledDeparture: '2026-10-12T09:40:00Z',
    departureAirport: 'BKK',
    arrivalAirport: 'NRT',
    passengerCount: 188,
    aircraftId: 'a-fya',
    status: 'open',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-12T09:40:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-309',
    flightNumber: 'FL309',
    routeId: 'r-nrt-bkk',
    scheduledDeparture: '2026-10-19T18:20:00Z',
    departureAirport: 'NRT',
    arrivalAirport: 'BKK',
    passengerCount: 176,
    aircraftId: 'a-fya',
    status: 'open',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-19T18:20:00Z'),
    warehouseId: 'w-nrt',
    isCancelled: false,
  },
  {
    id: 'f-400',
    flightNumber: 'FL400',
    routeId: 'r-bkk-nrt',
    scheduledDeparture: '2026-10-09T06:00:00Z',
    departureAirport: 'BKK',
    arrivalAirport: 'NRT',
    passengerCount: 110,
    aircraftId: 'a-fya',
    status: 'generated',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-09T06:00:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-401',
    flightNumber: 'FL401',
    routeId: 'r-lhr-bkk',
    scheduledDeparture: '2026-10-09T13:15:00Z',
    departureAirport: 'LHR',
    arrivalAirport: 'BKK',
    passengerCount: 147,
    aircraftId: 'a-fya',
    status: 'loaded',
    cabin: 'business',
    cutoffAt: cutoff('2026-10-09T13:15:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-402',
    flightNumber: 'FL402',
    routeId: 'r-bkk-cnx',
    scheduledDeparture: '2026-10-09T20:30:00Z',
    departureAirport: 'BKK',
    arrivalAirport: 'CNX',
    passengerCount: 184,
    aircraftId: 'a-fya',
    status: 'generated',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-09T20:30:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-403',
    flightNumber: 'FL403',
    routeId: 'r-icn-bkk',
    scheduledDeparture: '2026-10-09T11:45:00Z',
    departureAirport: 'ICN',
    arrivalAirport: 'BKK',
    passengerCount: 221,
    aircraftId: 'a-fya',
    status: 'generated',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-09T11:45:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-404',
    flightNumber: 'FL404',
    routeId: 'r-bkk-del',
    scheduledDeparture: '2026-10-09T18:00:00Z',
    departureAirport: 'BKK',
    arrivalAirport: 'DEL',
    passengerCount: 258,
    aircraftId: 'a-fya',
    status: 'generated',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-09T18:00:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-405',
    flightNumber: 'FL405',
    routeId: 'r-sin-bkk',
    scheduledDeparture: '2026-10-09T09:15:00Z',
    departureAirport: 'SIN',
    arrivalAirport: 'BKK',
    passengerCount: 135,
    aircraftId: 'a-fya',
    status: 'closed',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-09T09:15:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-406',
    flightNumber: 'FL406',
    routeId: 'r-bkk-syd',
    scheduledDeparture: '2026-10-10T16:30:00Z',
    departureAirport: 'BKK',
    arrivalAirport: 'SYD',
    passengerCount: 172,
    aircraftId: 'a-fya',
    status: 'open',
    cabin: 'economy',
    cutoffAt: cutoff('2026-10-10T16:30:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: false,
  },
  {
    id: 'f-407',
    flightNumber: 'FL407',
    routeId: 'r-bkk-hnd',
    scheduledDeparture: '2026-10-11T22:55:00Z',
    departureAirport: 'BKK',
    arrivalAirport: 'HND',
    passengerCount: 192,
    aircraftId: 'a-fya',
    status: 'void',
    cabin: 'business',
    cutoffAt: cutoff('2026-10-11T22:55:00Z'),
    warehouseId: 'w-bkk',
    isCancelled: true,
  },
]

// -- Catering orders --------------------------------------------------------
// Seeded with one entry per flight that has reached its cutoff (and so the
// catering order has been generated). 'open' and 'void' flights have no
// entry here.

// Mirror the prototype's FY308: green curry 96 (order), braised beef 64
// (order), VGML 14 (order), halal 18 (order, short 8), wagyu 12
// (default, short 3), cold brew 40 (order). The seeded BKK warehouse has
// 10 halal (18 reserved, 18 over) and 9 wagyu (12 reserved, 3 over) so
// the shortfall matches.
function seedOrder(flightId: string, lines: CateringOrder['lines']): CateringOrder {
  const flight = mockFlights.find((f) => f.id === flightId)!
  return {
    id: `co-${flightId}`,
    flightId,
    flightNumber: flight.flightNumber,
    departureAirport: flight.departureAirport,
    arrivalAirport: flight.arrivalAirport,
    scheduledDeparture: flight.scheduledDeparture,
    passengerCount: flight.passengerCount,
    status: 'generated',
    cutoffAt: flight.cutoffAt,
    generatedAt: flight.cutoffAt,
    loadedAt: null,
    warehouseId: flight.warehouseId,
    aircraftId: flight.aircraftId,
    lines,
  }
}

const ecoLines = (flightId: string, n: number): CateringOrder['lines'] => [
  {
    id: `${flightId}-1`,
    cabin: 'economy',
    productId: 'p-001',
    productName: 'Green curry chicken, jasmine rice',
    quantityRequired: Math.round(n * 0.5),
    quantityShort: 0,
    source: 'order',
  },
  {
    id: `${flightId}-2`,
    cabin: 'economy',
    productId: 'p-002',
    productName: 'Braised beef, mash and greens',
    quantityRequired: Math.round(n * 0.3),
    quantityShort: 0,
    source: 'order',
  },
  {
    id: `${flightId}-3`,
    cabin: 'economy',
    productId: 'p-004',
    productName: 'Vegetarian meal',
    quantityRequired: Math.round(n * 0.07),
    quantityShort: 0,
    source: 'order',
  },
  {
    id: `${flightId}-4`,
    cabin: 'economy',
    productId: 'p-005',
    productName: 'Halal meal',
    quantityRequired: Math.round(n * 0.09),
    quantityShort: 0,
    source: 'order',
  },
  {
    id: `${flightId}-5`,
    cabin: 'business',
    productId: 'p-002',
    productName: 'Braised beef, mash and greens',
    quantityRequired: 12,
    quantityShort: 0,
    source: 'default',
  },
  {
    id: `${flightId}-6`,
    cabin: 'all',
    productId: 'p-009',
    productName: 'Cold brew coffee',
    quantityRequired: 40,
    quantityShort: 0,
    source: 'order',
  },
]

const businessLines = (flightId: string): CateringOrder['lines'] => [
  {
    id: `${flightId}-1`,
    cabin: 'business',
    productId: 'p-002',
    productName: 'Braised beef, mash and greens',
    quantityRequired: 22,
    quantityShort: 0,
    source: 'default',
  },
  {
    id: `${flightId}-2`,
    cabin: 'business',
    productId: 'p-004',
    productName: 'Vegetarian meal',
    quantityRequired: 8,
    quantityShort: 0,
    source: 'default',
  },
  {
    id: `${flightId}-3`,
    cabin: 'all',
    productId: 'p-009',
    productName: 'Cold brew coffee',
    quantityRequired: 30,
    quantityShort: 0,
    source: 'order',
  },
]

const f308: CateringOrder = {
  ...seedOrder('f-308', []),
  passengerCount: 212,
  lines: [
    {
      id: 'f-308-1',
      cabin: 'economy',
      productId: 'p-001',
      productName: 'Green curry chicken, jasmine rice',
      quantityRequired: 96,
      quantityShort: 0,
      source: 'order',
    },
    {
      id: 'f-308-2',
      cabin: 'economy',
      productId: 'p-002',
      productName: 'Braised beef, mash and greens',
      quantityRequired: 64,
      quantityShort: 0,
      source: 'order',
    },
    {
      id: 'f-308-3',
      cabin: 'economy',
      productId: 'p-004',
      productName: 'Vegetarian meal',
      quantityRequired: 14,
      quantityShort: 0,
      source: 'order',
    },
    {
      id: 'f-308-4',
      cabin: 'economy',
      productId: 'p-005',
      productName: 'Halal meal',
      quantityRequired: 18,
      quantityShort: 0,
      source: 'order',
    },
    {
      id: 'f-308-5',
      cabin: 'business',
      productId: 'p-007',
      productName: 'Wagyu beef rice bowl',
      quantityRequired: 12,
      quantityShort: 0,
      source: 'default',
    },
    {
      id: 'f-308-6',
      cabin: 'all',
      productId: 'p-009',
      productName: 'Cold brew coffee',
      quantityRequired: 40,
      quantityShort: 0,
      source: 'order',
    },
  ],
}

const f400: CateringOrder = {
  ...seedOrder('f-400', []),
  passengerCount: 110,
  lines: ecoLines('f-400', 110).concat([
    {
      id: 'f-400-7',
      cabin: 'business',
      productId: 'p-007',
      productName: 'Wagyu beef rice bowl',
      quantityRequired: 14,
      quantityShort: 0,
      source: 'default',
    },
  ]),
}

const f402: CateringOrder = {
  ...seedOrder('f-402', []),
  passengerCount: 184,
  lines: ecoLines('f-402', 184),
}

const f403: CateringOrder = {
  ...seedOrder('f-403', []),
  passengerCount: 221,
  lines: ecoLines('f-403', 221),
}

const f404: CateringOrder = {
  ...seedOrder('f-404', []),
  passengerCount: 258,
  lines: ecoLines('f-404', 258),
}

const f401: CateringOrder = {
  ...seedOrder('f-401', []),
  passengerCount: 147,
  status: 'loaded',
  loadedAt: MOCK_NOW_ISO,
  lines: businessLines('f-401'),
}

const f405: CateringOrder = {
  ...seedOrder('f-405', []),
  passengerCount: 135,
  status: 'closed',
  loadedAt: MOCK_NOW_ISO,
  lines: ecoLines('f-405', 135).slice(0, 3),
}

const orders: CateringOrder[] = [f308, f400, f401, f402, f403, f404, f405]

// -- Public snapshots -------------------------------------------------------

export function snapshotCateringOrders(): CateringOrder[] {
  return orders.map(cloneOrder)
}

export function snapshotFlight(flightId: string): Flight | null {
  const f = mockFlights.find((f) => f.id === flightId)
  return f ? { ...f } : null
}

export function snapshotFlights(): Flight[] {
  return mockFlights.map((f) => ({ ...f }))
}

function cloneOrder(o: CateringOrder): CateringOrder {
  return { ...o, lines: o.lines.map((l) => ({ ...l })) }
}

function findOrder(flightId: string): CateringOrder {
  const idx = orders.findIndex((o) => o.flightId === flightId)
  if (idx === -1) {
    throw new Error(`Catering order for flight ${flightId} not found.`)
  }
  return orders[idx]
}

// -- Mutations --------------------------------------------------------------

export class CateringApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'CateringApiError'
  }
}

function recountShortfalls(order: CateringOrder): CateringOrder {
  for (const line of order.lines) {
    const available = getAvailableStock(order.warehouseId, line.productId)
    line.quantityShort = Math.max(0, line.quantityRequired - available)
  }
  return order
}

// Refresh is the staff-driven "recount against current stock" action. The
// spec calls it ORDER_NOT_YET_DUE before the cutoff and the catering
// order is generated automatically by the scheduled job; refresh just
// redoes the short computation. Idempotent on a second call.
export function refreshCateringOrder(flightId: string): CateringOrder {
  const flight = mockFlights.find((f) => f.id === flightId)
  if (!flight) throw new CateringApiError('NOT_FOUND', 'Flight not found.')
  if (flight.status === 'void') throw new CateringApiError('CATERING_VOID', 'This flight is cancelled.')
  if (MOCK_NOW_ISO < flight.cutoffAt) {
    throw new CateringApiError('ORDER_NOT_YET_DUE', 'Ordering is still open. The catering order will be generated at the cutoff.')
  }
  const order = findOrder(flightId)
  if (order.status === 'closed') return cloneOrder(order)
  recountShortfalls(order)
  return cloneOrder(order)
}

// Mark an order loaded after a transfer. Spec: refuse when any line is
// still short (STOCK_SHORTFALL). The button is hidden in the UI on void
// and closed orders, but the store enforces it too.
export function markCateringOrderLoaded(flightId: string): CateringOrder {
  const order = findOrder(flightId)
  if (order.status === 'void') throw new CateringApiError('CATERING_VOID', 'This flight is cancelled.')
  if (order.status === 'closed') throw new CateringApiError('CATERING_CLOSED', 'This catering order is already closed.')
  recountShortfalls(order)
  if (order.lines.some((l) => l.quantityShort > 0)) {
    throw new CateringApiError('STOCK_SHORTFALL', 'Some lines are still short. Receive more stock and refresh before loading.')
  }
  order.status = 'loaded'
  order.loadedAt = MOCK_NOW_ISO
  // Reflect on the flight too so the left-list chip updates.
  const flight = mockFlights.find((f) => f.id === flightId)
  if (flight) flight.status = 'loaded'
  return cloneOrder(order)
}

// Close out an order. Spec: any state other than void/closed is fine;
// the flight report will also close it later.
export function closeCateringOrder(flightId: string): CateringOrder {
  const order = findOrder(flightId)
  if (order.status === 'void') throw new CateringApiError('CATERING_VOID', 'This flight is cancelled.')
  if (order.status === 'closed') throw new CateringApiError('CATERING_CLOSED', 'This catering order is already closed.')
  order.status = 'closed'
  if (!order.loadedAt) order.loadedAt = MOCK_NOW_ISO
  const flight = mockFlights.find((f) => f.id === flightId)
  if (flight) flight.status = 'closed'
  return cloneOrder(order)
}
