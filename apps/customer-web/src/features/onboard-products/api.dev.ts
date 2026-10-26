// Dev-only mock fetchers for the Booking Details page. Tree-shaken out of
// production builds via the `import.meta.env.DEV` constant in api.ts.
//
// To eyeball page 1 in the browser before the backend is ready:
//   1. Start the customer-web app: `npm run dev -w apps/customer-web`
//   2. Sign in via Clerk (any dev email).
//   3. Open any URL like http://localhost:5151/bookings/anything
//      (the mock ignores the bookingId and returns the same sample).
//
// To exercise different UI states, edit MOCK_ORDERS / MOCK_BOOKING below:
//   - Set MOCK_ORDERS = [] to see the "no orders" empty state.
//   - Move all flight cutoffs into the past to see the "Ordering closed"
//     banner.
//   - Set an order's `changesAllowedUntil` to the past to see the
//     "Cancel button hidden" case.

import { ApiError } from './types'
import type { Booking, CabinSetting, PlaceOrderPayload, Product, ProductOrder } from './types'

const NOW = new Date()

// Build a future-or-past ISO timestamp offset from module load time.
function offsetIso(daysFromNow: number, hours = 0, minutes = 0): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// --- Booking ----------------------------------------------------------

const PASSENGERS = [
  { id: 'p-somchai', firstName: 'Somchai', lastName: 'Wongsakul', type: 'adult', isAccountHolder: true },
  { id: 'p-malee', firstName: 'Malee', lastName: 'Wongsakul', type: 'adult', isAccountHolder: false },
  { id: 'p-nara', firstName: 'Nara', lastName: 'Wongsakul', type: 'child', isAccountHolder: false },
] as const

// FY308 cuts off in 1 day, FY309 in 6 days. Banner will show FY308's.
const FY308_DEPARTURE = offsetIso(3, 9, 40)
const FY308_CUTOFF = offsetIso(1, 9, 40)
const FY309_DEPARTURE = offsetIso(8, 18, 20)
const FY309_CUTOFF = offsetIso(6, 18, 20)

export const MOCK_BOOKING: Booking = {
  id: 'mock-booking',
  reference: 'FLY7K2',
  status: 'confirmed',
  tripType: 'round_trip',
  totalPassengers: 3,
  routeSummary: 'Bangkok to Tokyo',
  passengers: [...PASSENGERS],
  flights: [
    {
      id: 'f-308',
      flightNumber: 'FY308',
      origin: { code: 'BKK', city: 'Bangkok' },
      destination: { code: 'NRT', city: 'Tokyo' },
      scheduledDeparture: FY308_DEPARTURE,
      cabinClass: 'economy',
      seatNumbers: ['24A', '24B', '24C'],
      cutoffAt: FY308_CUTOFF,
    },
    {
      id: 'f-309',
      flightNumber: 'FY309',
      origin: { code: 'NRT', city: 'Tokyo' },
      destination: { code: 'BKK', city: 'Bangkok' },
      scheduledDeparture: FY309_DEPARTURE,
      cabinClass: 'economy',
      seatNumbers: ['24A', '24B', '24C'],
      cutoffAt: FY309_CUTOFF,
    },
  ],
}

// --- Orders -----------------------------------------------------------
//
// Covers every visible lifecycle state:
//   PO-2041 → confirmed + paid, happy path, cancel button visible
//   PO-2044 → confirmed + paid, duty-free line, cancel button visible
//   PO-2050 → pending_payment, cancel button visible
//   PO-2051 → cancelled + refund requested, no cancel button (status)
//   PO-2052 → confirmed + paid, but deadline passed, no cancel button

const MOCK_ORDERS: ProductOrder[] = [
  {
    id: 'PO-2041',
    bookingId: 'mock-booking',
    flightId: 'f-308',
    flightNumber: 'FY308',
    flightOriginCode: 'BKK',
    flightDestinationCode: 'NRT',
    placedAt: offsetIso(-5, 19, 12),
    changesAllowedUntil: FY308_CUTOFF,
    status: 'confirmed',
    paidAt: offsetIso(-5, 19, 15),
    cancelledAt: null,
    refundRequestedAt: null,
    refundId: null,
    totalAmount: 38,
    currency: 'USD',
    lines: [
      {
        id: 'l-1',
        productId: 'prod-beef',
        productName: 'Braised beef, mash and greens',
        category: 'meal',
        quantity: 1,
        unitPrice: 14,
        priceBasis: 'standard',
        passengerId: 'p-somchai',
        fulfillmentNote: null,
        lineTotal: 14,
      },
      {
        id: 'l-2',
        productId: 'prod-vgml',
        productName: 'Vegetarian meal (VGML)',
        category: 'meal',
        quantity: 1,
        unitPrice: 12,
        priceBasis: 'standard',
        passengerId: 'p-malee',
        fulfillmentNote: null,
        lineTotal: 12,
      },
      {
        id: 'l-3',
        productId: 'prod-oj',
        productName: 'Fresh orange juice',
        category: 'beverage',
        quantity: 3,
        unitPrice: 4,
        priceBasis: 'standard',
        passengerId: null,
        fulfillmentNote: null,
        lineTotal: 12,
      },
    ],
  },
  {
    id: 'PO-2044',
    bookingId: 'mock-booking',
    flightId: 'f-309',
    flightNumber: 'FY309',
    flightOriginCode: 'NRT',
    flightDestinationCode: 'BKK',
    placedAt: offsetIso(-4, 10, 3),
    changesAllowedUntil: FY309_CUTOFF,
    status: 'confirmed',
    paidAt: offsetIso(-4, 10, 5),
    cancelledAt: null,
    refundRequestedAt: null,
    refundId: null,
    totalAmount: 62,
    currency: 'USD',
    lines: [
      {
        id: 'l-4',
        productId: 'prod-perfume',
        productName: 'Jasmine eau de parfum, 50 ml',
        category: 'duty_free',
        quantity: 1,
        unitPrice: 62,
        priceBasis: 'standard',
        passengerId: null,
        fulfillmentNote: 'Collect on board',
        lineTotal: 62,
      },
    ],
  },
  {
    id: 'PO-2050',
    bookingId: 'mock-booking',
    flightId: 'f-309',
    flightNumber: 'FY309',
    flightOriginCode: 'NRT',
    flightDestinationCode: 'BKK',
    placedAt: offsetIso(0, 12, 0),
    changesAllowedUntil: FY309_CUTOFF,
    status: 'pending_payment',
    paidAt: null,
    cancelledAt: null,
    refundRequestedAt: null,
    refundId: null,
    totalAmount: 8,
    currency: 'USD',
    lines: [
      {
        id: 'l-5',
        productId: 'prod-coffee',
        productName: 'Coffee',
        category: 'beverage',
        quantity: 2,
        unitPrice: 4,
        priceBasis: 'standard',
        passengerId: null,
        fulfillmentNote: null,
        lineTotal: 8,
      },
    ],
  },
  {
    // Pre-seeded in pending_payment for the F12 dev `?preset=waiting`
    // visual diff. The F5 demo buttons (paid / failed) operate on this
    // real entry so confirmOrderMock / cancelProductOrderMock both find
    // it. Mirrors the Page 4 cart: Somchai beef (free) + 1× parfum = $62.
    id: 'PO-DEV-WAITING',
    bookingId: 'mock-booking',
    flightId: 'f-308',
    flightNumber: 'FY308',
    flightOriginCode: 'BKK',
    flightDestinationCode: 'NRT',
    placedAt: offsetIso(0, 13, 0),
    changesAllowedUntil: FY308_CUTOFF,
    status: 'pending_payment',
    paidAt: null,
    cancelledAt: null,
    refundRequestedAt: null,
    refundId: null,
    totalAmount: 62,
    currency: 'USD',
    lines: [
      {
        id: 'l-w-1',
        productId: 'prod-beef',
        productName: 'Braised beef, mash and greens',
        category: 'meal',
        quantity: 1,
        unitPrice: 0,
        priceBasis: 'included',
        passengerId: 'p-somchai',
        fulfillmentNote: null,
        lineTotal: 0,
      },
      {
        id: 'l-w-2',
        productId: 'prod-perfume',
        productName: 'Jasmine eau de parfum, 50 ml',
        category: 'duty_free',
        quantity: 1,
        unitPrice: 62,
        priceBasis: 'standard',
        passengerId: 'p-somchai',
        fulfillmentNote: 'Collect on board',
        lineTotal: 62,
      },
    ],
  },
  {
    id: 'PO-2051',
    bookingId: 'mock-booking',
    flightId: 'f-308',
    flightNumber: 'FY308',
    flightOriginCode: 'BKK',
    flightDestinationCode: 'NRT',
    placedAt: offsetIso(-8, 8, 0),
    changesAllowedUntil: FY308_CUTOFF,
    status: 'cancelled',
    paidAt: offsetIso(-8, 8, 5),
    cancelledAt: offsetIso(-5, 14, 30),
    refundRequestedAt: offsetIso(-5, 14, 30),
    // Stamp is applied at preset-evaluation time (see the
    // `?preset=refund-requested` branch above) so the id comes from
    // the same `nextRefundSeq` counter as the live cancel path. No
    // hand-typed literal here.
    refundId: null,
    totalAmount: 14,
    currency: 'USD',
    lines: [
      {
        id: 'l-6',
        productId: 'prod-chicken',
        productName: 'Chicken rice meal',
        category: 'meal',
        quantity: 1,
        unitPrice: 14,
        priceBasis: 'standard',
        passengerId: 'p-somchai',
        fulfillmentNote: null,
        lineTotal: 14,
      },
    ],
  },
  {
    id: 'PO-2052',
    bookingId: 'mock-booking',
    flightId: 'f-309',
    flightNumber: 'FY309',
    flightOriginCode: 'NRT',
    flightDestinationCode: 'BKK',
    placedAt: offsetIso(-10, 9, 0),
    // Deadline already passed → cancel button is hidden even though the
    // order is still confirmed+paid.
    changesAllowedUntil: offsetIso(-1, 0, 0),
    status: 'confirmed',
    paidAt: offsetIso(-10, 9, 5),
    cancelledAt: null,
    refundRequestedAt: null,
    refundId: null,
    totalAmount: 6,
    currency: 'USD',
    lines: [
      {
        id: 'l-7',
        productId: 'prod-brownie',
        productName: 'Chocolate brownie',
        category: 'snack',
        quantity: 1,
        unitPrice: 6,
        priceBasis: 'standard',
        passengerId: null,
        fulfillmentNote: null,
        lineTotal: 6,
      },
    ],
  },
]

// To exercise the empty state, set MOCK_ORDERS to [] above and reload.

export async function fetchBookingMock(): Promise<Booking> {
  await delay(250)
  return MOCK_BOOKING
}

export async function fetchProductOrdersForBookingMock(
  preset?: 'ready' | 'duty-free' | 'waiting' | 'failed' | 'confirmed' | 'cancel-po-2041' | 'refund-requested',
): Promise<ProductOrder[]> {
  await delay(350)
  if (preset === 'confirmed') {
    // Page 8: the Figma's exact three orders. The other 3 in MOCK_ORDERS
    // (PO-2050 pending, PO-2051 cancelled, PO-DEV-WAITING pending) are
    // for exercising lifecycle states on the unpreseted dev visit.
    return MOCK_ORDERS.filter((o) => o.id === 'PO-2041' || o.id === 'PO-2044' || o.id === 'PO-2052')
  }
  if (preset === 'refund-requested') {
    // Page 10: the Figma's exact two orders, with PO-2041 in the
    // cancelled+refund state. Mirrors the mutation
    // cancelProductOrderMock performs on confirm. Idempotent: repeated
    // calls in the same dev session keep PO-2041 in the refunded state
    // so refreshing the page doesn't revert it.
    const po2041 = MOCK_ORDERS.find((o) => o.id === 'PO-2041')
    if (po2041 && po2041.status !== 'cancelled') {
      const refundedAt = offsetIso(0, 9, 0)
      po2041.status = 'cancelled'
      po2041.cancelledAt = refundedAt
      po2041.refundRequestedAt = refundedAt
      // Draw a fresh id from the same counter the live cancel path uses,
      // so the seeded Page 10 case shares the id generator with the real
      // flow (no hand-typed literals).
      po2041.refundId = `RF-${nextRefundSeq++}`
    }
    return MOCK_ORDERS.filter((o) => o.id === 'PO-2041' || o.id === 'PO-2044')
  }
  // Page 9 (cancel-po-2041) and all other unpreseted visits return the
  // full set so the dev can exercise every lifecycle state.
  return MOCK_ORDERS
}

export async function cancelProductOrderMock(orderId: string): Promise<ProductOrder> {
  await delay(400)
  const order = MOCK_ORDERS.find((o) => o.id === orderId)
  if (!order) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', `Order ${orderId} not found`)
  }
  if (order.status === 'cancelled') {
    return order
  }
  const nowIso = new Date().toISOString()
  order.status = 'cancelled'
  order.cancelledAt = nowIso
  order.refundRequestedAt = nowIso
  order.refundId = `RF-${nextRefundSeq++}`
  return order
}

// --- Catalog (page 2) -------------------------------------------------

// Both flights share the same catalog for the demo. The "Default meal"
// pseudo-product represents "no pre-order, serve whatever the cabin has".
// Selecting it doesn't create a line in the order.
const DEFAULT_MEAL: Product = {
  id: 'prod-default',
  category: 'meal',
  typeCode: null,
  name: 'Default meal',
  description: 'Green curry chicken, jasmine rice. No pre-order needed.',
  unitPrice: 0,
  isPremium: false,
  thumbnailColor: '#d3f9d8',
  imageUrl: '/products/default-meal.svg',
  isDefaultChoice: true,
}

const MOCK_CATALOG: Product[] = [
  DEFAULT_MEAL,
  {
    id: 'prod-green-curry',
    category: 'meal',
    typeCode: null,
    name: 'Green curry chicken, jasmine rice',
    description: 'Mild coconut green curry. The default meal on this route.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#d3f9d8',
    imageUrl: '/products/default-meal.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-beef',
    category: 'meal',
    typeCode: null,
    name: 'Braised beef, mash and greens',
    description: 'Slow-cooked beef in red wine gravy.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#ffe5d0',
    imageUrl: '/products/braised-beef.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-pasta',
    category: 'meal',
    typeCode: null,
    name: 'Baked pasta, tomato and mozzarella',
    description: 'Vegetarian. Contains dairy and gluten.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#ffd8d8',
    imageUrl: '/products/baked-pasta.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-vgml',
    category: 'meal',
    typeCode: 'VGML',
    name: 'Vegetarian meal',
    description: 'Vegan: no meat, dairy or egg.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#d3f9d8',
    imageUrl: '/products/vegetarian.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-moml',
    category: 'meal',
    typeCode: 'MOML',
    name: 'Halal meal',
    description: 'Prepared to halal standards, no pork or alcohol.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#fff3bf',
    imageUrl: '/products/halal.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-ksml',
    category: 'meal',
    typeCode: 'KSML',
    name: 'Kosher meal',
    description: 'Sealed, kosher-certified tray.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#e7e7ff',
    imageUrl: '/products/kosher.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-dbml',
    category: 'meal',
    typeCode: 'DBML',
    name: 'Diabetic meal',
    description: 'Low sugar, controlled carbohydrate.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#e7f5ff',
    imageUrl: '/products/diabetic.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-gfml',
    category: 'meal',
    typeCode: 'GFML',
    name: 'Gluten-free meal',
    description: 'No wheat, barley or rye.',
    unitPrice: 0,
    isPremium: false,
    thumbnailColor: '#f3f0ff',
    imageUrl: '/products/gluten-free.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-wagyu',
    category: 'meal',
    typeCode: null,
    name: 'Wagyu beef rice bowl',
    description: 'Seared wagyu, pickled vegetables, soy glaze.',
    unitPrice: 24,
    isPremium: true,
    thumbnailColor: '#2b2b2b',
    imageUrl: '/products/wagyu.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-orange-juice',
    category: 'beverage',
    typeCode: null,
    name: 'Fresh orange juice',
    description: '250 ml, pressed that morning.',
    unitPrice: 4,
    isPremium: false,
    thumbnailColor: '#fdf0d9',
    imageUrl: '/products/orange-juice.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-coffee',
    category: 'beverage',
    typeCode: null,
    name: 'Cold brew coffee',
    description: '250 ml can, unsweetened.',
    unitPrice: 5,
    isPremium: false,
    thumbnailColor: '#e6e9ee',
    imageUrl: '/products/coffee.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-nuts',
    category: 'snack',
    typeCode: null,
    name: 'Mixed roasted nuts',
    description: 'Salted almonds, cashews and peanuts.',
    unitPrice: 4,
    isPremium: false,
    thumbnailColor: '#f6ede0',
    imageUrl: '/products/nuts.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-brownie',
    category: 'snack',
    typeCode: null,
    name: 'Chocolate brownie',
    description: 'Dark chocolate, baked on the ground.',
    unitPrice: 5,
    isPremium: false,
    thumbnailColor: '#efe4de',
    imageUrl: '/products/brownie.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-perfume',
    category: 'duty_free',
    typeCode: null,
    name: 'Jasmine eau de parfum, 50 ml',
    description: 'Floral, with a green tea base note.',
    unitPrice: 62,
    isPremium: false,
    thumbnailColor: '#f1e8f5',
    imageUrl: '/products/perfume.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-scarf',
    category: 'duty_free',
    typeCode: null,
    name: 'Silk scarf',
    description: 'Hand-printed, 90 by 90 cm.',
    unitPrice: 48,
    isPremium: false,
    thumbnailColor: '#f9e9ee',
    imageUrl: '/products/scarf.svg',
    isDefaultChoice: false,
  },
  {
    id: 'prod-whisky',
    category: 'duty_free',
    typeCode: null,
    name: 'Single malt whisky, 700 ml',
    description: '12 years. Adults only.',
    unitPrice: 85,
    isPremium: false,
    thumbnailColor: '#f3e9dc',
    imageUrl: '/products/whisky.svg',
    isDefaultChoice: false,
  },
]

export async function fetchCatalogMock(flightId: string): Promise<Product[]> {
  await delay(200)
  void flightId
  return MOCK_CATALOG
}

// --- Cabin setting (page 2) -------------------------------------------

const MOCK_CABIN_BY_FLIGHT: Record<string, CabinSetting> = {
  'f-308': {
    flightId: 'f-308',
    cabin: 'economy',
    mealService: 'complimentary',
    mealSelection: 'choose',
    includedPerPassenger: 1,
    preorderEnabled: true,
    orderWindowHours: 48,
    premiumMealsAllowed: true,
    snacksEnabled: true,
    dutyFreeEnabled: true,
  },
  'f-309': {
    flightId: 'f-309',
    cabin: 'economy',
    mealService: 'complimentary',
    mealSelection: 'choose',
    includedPerPassenger: 1,
    preorderEnabled: true,
    orderWindowHours: 48,
    premiumMealsAllowed: true,
    snacksEnabled: true,
    dutyFreeEnabled: true,
  },
}

export async function fetchCabinSettingMock(flightId: string): Promise<CabinSetting> {
  await delay(200)
  const setting = MOCK_CABIN_BY_FLIGHT[flightId]
  if (!setting) {
    throw new ApiError(404, 'CABIN_SETTING_NOT_FOUND', `No cabin setting for flight ${flightId}`)
  }
  return setting
}

// --- Place order (page 2) ---------------------------------------------

let nextOrderSeq = 2100
// Monotonic refund-request counter. The seeded `?preset=refund-requested`
// URL draws its id from this counter when it transitions PO-2041 into
// the cancelled+refund state, and live cancel clicks keep drawing
// from the same counter. One source of truth — no hand-typed literals.
let nextRefundSeq = 3001

export async function placeOrderMock(payload: PlaceOrderPayload): Promise<ProductOrder> {
  await delay(500)
  if (payload.lines.length === 0) {
    throw new ApiError(400, 'EMPTY_ORDER', 'Order must contain at least one line')
  }
  const flight = MOCK_BOOKING.flights.find((f) => f.id === payload.flightId)
  if (!flight) {
    throw new ApiError(404, 'FLIGHT_NOT_FOUND', `Flight ${payload.flightId} not found on this booking`)
  }
  const nowIso = new Date().toISOString()
  const orderId = `PO-${++nextOrderSeq}`
  const total = payload.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  const order: ProductOrder = {
    id: orderId,
    bookingId: payload.bookingId,
    flightId: payload.flightId,
    flightNumber: flight.flightNumber,
    flightOriginCode: flight.origin.code,
    flightDestinationCode: flight.destination.code,
    placedAt: nowIso,
    changesAllowedUntil: flight.cutoffAt ?? FY308_CUTOFF,
    status: 'pending_payment',
    paidAt: null,
    cancelledAt: null,
    refundRequestedAt: null,
    refundId: null,
    totalAmount: total,
    currency: 'USD',
    lines: payload.lines.map((l, idx) => {
      const product = MOCK_CATALOG.find((p) => p.id === l.productId)
      return {
        id: `${orderId}-l${idx + 1}`,
        productId: l.productId,
        productName: product?.name ?? l.productId,
        category: l.category,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        priceBasis: l.priceBasis,
        passengerId: l.passengerId,
        fulfillmentNote: l.category === 'duty_free' ? 'Collect on board' : null,
        lineTotal: l.unitPrice * l.quantity,
      }
    }),
  }
  MOCK_ORDERS.push(order)
  return order
}

// Confirm a freshly-placed order without going through F5 (the $0
// short-circuit). In a real flow the F5 callback would do this.
export async function confirmOrderMock(orderId: string): Promise<ProductOrder> {
  await delay(200)
  const order = MOCK_ORDERS.find((o) => o.id === orderId)
  if (!order) {
    throw new ApiError(404, 'ORDER_NOT_FOUND', `Order ${orderId} not found`)
  }
  if (order.status === 'pending_payment') {
    order.status = 'confirmed'
    order.paidAt = new Date().toISOString()
  }
  return order
}
