// Per-area mappers: wire format (snake_case, ISO dates, decimal strings)
// → frontend types (camelCase, ISO strings, numbers). Each `mapXxx`
// accepts the snake_case shape and returns the camelCase UI shape; the
// inverse `toXxxInput` maps the UI shape back to the wire shape for
// PUT/POST bodies.

import type {
  AircraftStockRow,
  CabinSetting,
  CateringOrder,
  CateringOrderLine,
  CreateFlightSaleInput,
  CreatePurchaseReceiptInput,
  DietaryAttribute,
  Flight,
  FlightCateringStatus,
  FlightException,
  FlightReport,
  FlightReportLine,
  FlightReportStatus,
  FlightSummary,
  Product,
  ProductCategory,
  ProductOffering,
  ProductSale,
  PurchaseReceipt,
  PurchaseReceiptLine,
  RouteDetail,
  RouteSummary,
  SpecialMealCode,
  StockBatch,
  StockMovement,
  StockMovementType,
  StockTransfer,
  StockTransferLine,
  Supplier,
  Warehouse,
  WarehouseStockRow,
} from './types'

// -- Helpers ------------------------------------------------------------------

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber()
  }
  return 0
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return toNumber(value)
}

function toIsoString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
}

function toNullableIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  return value
}

const DIETARY_ALLOW = new Set<DietaryAttribute>(['halal', 'vegetarian', 'vegan', 'kosher', 'diabetic', 'gluten_free'])

function toDietary(arr: unknown): DietaryAttribute[] {
  if (!Array.isArray(arr)) return []
  return arr.filter((v): v is DietaryAttribute => typeof v === 'string' && DIETARY_ALLOW.has(v as DietaryAttribute))
}

// -- Product -------------------------------------------------------------------

interface WireProduct {
  id: string
  sku: string
  category: string
  type_code: string
  name: string
  description?: string | null
  price_amount: number | string | { toNumber: () => number }
  purchase_cost_amount?: number | string | { toNumber: () => number } | null
  shelf_life_days?: number | null
  is_premium: boolean
  is_active: boolean
  image_key?: string | null
  dietary_attributes?: string[]
  is_in_use?: boolean
}

export function mapProduct(wire: WireProduct): Product {
  return {
    id: wire.id,
    sku: wire.sku,
    category: (wire.category as ProductCategory) ?? 'meal',
    typeCode: ((wire.type_code as SpecialMealCode) ?? 'STD') as SpecialMealCode,
    name: wire.name,
    description: wire.description ?? null,
    priceAmount: toNumber(wire.price_amount),
    purchaseCostAmount: toNullableNumber(wire.purchase_cost_amount),
    shelfLifeDays: wire.shelf_life_days == null ? null : Number(wire.shelf_life_days),
    isPremium: Boolean(wire.is_premium),
    isActive: Boolean(wire.is_active),
    imageKey: wire.image_key ?? null,
    dietaryAttributes: toDietary(wire.dietary_attributes),
    isInUse: wire.is_in_use,
  }
}

export interface ProductDraftInput {
  name: string
  sku: string
  category: ProductCategory
  typeCode: SpecialMealCode
  dietaryAttributes: DietaryAttribute[]
  priceAmount: number
  purchaseCostAmount: number | null
  shelfLifeDays: number | null
  isPremium: boolean
  isActive: boolean
  photo?: { dataUrl: string; fileName: string } | null
  description?: string | null
}

export function toProductDraft(input: ProductDraftInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: input.name,
    sku: input.sku,
    category: input.category,
    typeCode: input.typeCode,
    dietaryAttributes: input.dietaryAttributes,
    priceAmount: input.priceAmount,
    purchaseCostAmount: input.purchaseCostAmount,
    shelfLifeDays: input.shelfLifeDays,
    isPremium: input.isPremium,
    isActive: input.isActive,
  }
  if (input.description !== undefined) out.description = input.description
  if (input.photo) out.photo = { dataUrl: input.photo.dataUrl, fileName: input.photo.fileName }
  return out
}

// -- Warehouses / Suppliers ----------------------------------------------------

interface WireWarehouse {
  id: string
  code: string
  name: string
  airport_code: string
}

export function mapWarehouse(wire: WireWarehouse): Warehouse {
  return { id: wire.id, code: wire.code, name: wire.name, airportCode: wire.airport_code }
}

interface WireSupplier {
  id: string
  name: string
  airport_code: string
  contact?: string | null
  is_active?: boolean
}

export function mapSupplier(wire: WireSupplier): Supplier {
  return {
    id: wire.id,
    name: wire.name,
    airportCode: wire.airport_code,
    contact: wire.contact ?? null,
    isActive: wire.is_active ?? true,
  }
}

export function toSupplierInput(input: {
  name: string
  airportCode: string
  contact: string | null
  isActive: boolean
}): Record<string, unknown> {
  return {
    name: input.name,
    airportCode: input.airportCode,
    contact: input.contact,
    isActive: input.isActive,
  }
}

export function toWarehouseInput(input: { code: string; name: string; airportCode: string }): Record<string, unknown> {
  return { code: input.code, name: input.name, airportCode: input.airportCode }
}

// -- Stock batches -------------------------------------------------------------

interface WireStockBatch {
  id: string
  purchase_receipt_id: string
  warehouse_id: string
  product_id: string
  batch_code: string
  quantity_received: number
  quantity_remaining: number
  unit_cost_amount: number | string | { toNumber: () => number }
  received_at: string
  expires_at: string | null
  is_damaged: boolean
}

export function mapStockBatch(wire: WireStockBatch): StockBatch {
  return {
    id: wire.id,
    purchaseReceiptId: wire.purchase_receipt_id,
    warehouseId: wire.warehouse_id,
    productId: wire.product_id,
    batchCode: wire.batch_code,
    quantityReceived: Number(wire.quantity_received),
    quantityRemaining: Number(wire.quantity_remaining),
    unitCostAmount: toNumber(wire.unit_cost_amount),
    receivedAt: toIsoString(wire.received_at),
    expiresAt: toNullableIsoString(wire.expires_at),
    isDamaged: Boolean(wire.is_damaged),
  }
}

// -- Stock movements -----------------------------------------------------------

interface WireStockMovement {
  id: string
  product_id: string
  warehouse_id: string | null
  aircraft_id: string | null
  stock_batch_id: string | null
  stock_transfer_id: string | null
  product_order_id: string | null
  flight_id: string | null
  type: string
  quantity: number
  reason: string | null
  note: string | null
  created_by_staff_id: string | null
  occurred_at: string
}

export function mapStockMovement(wire: WireStockMovement): StockMovement {
  return {
    id: wire.id,
    productId: wire.product_id,
    warehouseId: wire.warehouse_id,
    aircraftId: wire.aircraft_id,
    stockBatchId: wire.stock_batch_id,
    stockTransferId: wire.stock_transfer_id,
    productOrderId: wire.product_order_id,
    flightId: wire.flight_id,
    type: (wire.type as StockMovementType) ?? 'adjust',
    quantity: Number(wire.quantity),
    reason: (wire.reason as StockMovement['reason']) ?? null,
    note: wire.note,
    createdByStaffId: wire.created_by_staff_id,
    occurredAt: toIsoString(wire.occurred_at),
  }
}

export function toStockMovementInput(input: {
  warehouseId: string
  productId: string
  quantity: number
  reason: 'spoilage' | 'damage' | 'expired' | 'count_correction'
  note: string | null
}): Record<string, unknown> {
  return {
    warehouseId: input.warehouseId,
    productId: input.productId,
    quantity: input.quantity,
    reason: input.reason,
    note: input.note,
  }
}

// -- Purchase receipts --------------------------------------------------------

interface WirePurchaseReceiptLine {
  product_id: string
  product_name: string
  quantity: number
  unit_cost_amount: number | string | { toNumber: () => number }
  batch_code: string
  expires_at: string | null
  line_total?: number | string | { toNumber: () => number }
}

interface WirePurchaseReceipt {
  id: string
  supplier_id: string
  warehouse_id: string
  received_at: string
  received_by_staff_id: string | null
  lines: WirePurchaseReceiptLine[]
}

export function mapPurchaseReceipt(wire: WirePurchaseReceipt): PurchaseReceipt {
  return {
    id: wire.id,
    supplierId: wire.supplier_id,
    warehouseId: wire.warehouse_id,
    receivedAt: toIsoString(wire.received_at),
    receivedByStaffId: wire.received_by_staff_id,
    lines: wire.lines.map(mapPurchaseReceiptLine),
  }
}

export function mapPurchaseReceiptLine(wire: WirePurchaseReceiptLine): PurchaseReceiptLine {
  return {
    productId: wire.product_id,
    productName: wire.product_name,
    quantity: Number(wire.quantity),
    unitCostAmount: toNumber(wire.unit_cost_amount),
    batchCode: wire.batch_code,
    expiresAt: toNullableIsoString(wire.expires_at),
    lineTotal: wire.line_total == null ? Number(wire.quantity) * toNumber(wire.unit_cost_amount) : toNumber(wire.line_total),
  }
}

export function toPurchaseReceiptInput(input: CreatePurchaseReceiptInput, productName: (id: string) => string): Record<string, unknown> {
  return {
    supplierId: input.supplierId,
    warehouseId: input.warehouseId,
    lines: input.lines.map((l) => ({
      productId: l.productId,
      productName: productName(l.productId),
      quantity: l.quantity,
      unitCostAmount: l.unitCostAmount,
      batchCode: `B-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`.toUpperCase(),
      expiresAt: l.expiresAt,
    })),
  }
}

// -- Offering ------------------------------------------------------------------

interface WireOffering {
  id: string
  product_id: string
  scope: string
  route_id: string | null
  flight_id: string | null
  cabin: string
  is_default: boolean
  is_active: boolean
}

export function mapOffering(wire: WireOffering): ProductOffering {
  return {
    id: wire.id,
    productId: wire.product_id,
    scope: (wire.scope as ProductOffering['scope']) ?? 'network',
    routeId: wire.route_id,
    flightId: wire.flight_id,
    cabin: (wire.cabin as ProductOffering['cabin']) ?? 'economy',
    isDefault: Boolean(wire.is_default),
    isActive: Boolean(wire.is_active),
  }
}

export function toOfferingInput(input: {
  productId: string
  scope: 'network' | 'route' | 'flight'
  routeId: string | null
  flightId: string | null
  cabin: ProductOffering['cabin']
  isDefault: boolean
  isActive: boolean
}): Record<string, unknown> {
  return {
    productId: input.productId,
    scope: input.scope,
    routeId: input.routeId,
    flightId: input.flightId,
    cabin: input.cabin,
    isDefault: input.isDefault,
    isActive: input.isActive,
  }
}

// -- Cabin setting ------------------------------------------------------------

interface WireCabinSetting {
  id: string
  scope: string
  route_id: string | null
  flight_id: string | null
  cabin: string
  meal_service: string | null
  meal_selection: string | null
  included_per_passenger: number | null
  preorder_enabled: boolean | null
  order_window_hours: number | null
  premium_meals_allowed: boolean | null
  snacks_enabled: boolean | null
  duty_free_enabled: boolean | null
  onboard_buffer_percent: number | null
}

export function mapCabinSetting(wire: WireCabinSetting): CabinSetting {
  return {
    id: wire.id,
    scope: (wire.scope as CabinSetting['scope']) ?? 'network',
    routeId: wire.route_id,
    flightId: wire.flight_id,
    cabin: (wire.cabin as CabinSetting['cabin']) ?? 'economy',
    mealService: (wire.meal_service as CabinSetting['mealService']) ?? null,
    mealSelection: (wire.meal_selection as CabinSetting['mealSelection']) ?? null,
    includedPerPassenger: wire.included_per_passenger == null ? null : Number(wire.included_per_passenger),
    preorderEnabled: wire.preorder_enabled,
    orderWindowHours: wire.order_window_hours == null ? null : Number(wire.order_window_hours),
    premiumMealsAllowed: wire.premium_meals_allowed,
    snacksEnabled: wire.snacks_enabled,
    dutyFreeEnabled: wire.duty_free_enabled,
    onboardBufferPercent: wire.onboard_buffer_percent == null ? null : Number(wire.onboard_buffer_percent),
  } as CabinSetting
}

export function toCabinSettingInput(input: {
  scope: 'network' | 'route' | 'flight'
  routeId: string | null
  flightId: string | null
  cabin: CabinSetting['cabin']
  patch: Record<string, unknown>
}): Record<string, unknown> {
  return {
    scope: input.scope,
    routeId: input.routeId,
    flightId: input.flightId,
    cabin: input.cabin,
    ...input.patch,
  }
}

// -- Routes / flight exceptions -----------------------------------------------

interface WireRoute {
  id: string
  origin_airport: string
  destination_airport: string
  origin_city: string
  destination_city: string
}

export function mapRoute(wire: WireRoute): RouteSummary {
  return {
    id: wire.id,
    originAirport: wire.origin_airport,
    destinationAirport: wire.destination_airport,
    originCity: wire.origin_city,
    destinationCity: wire.destination_city,
    // Status flags get filled in by the caller from cabin_settings rows.
    cabinStatuses: {
      economy: { state: 'inherited', mealService: 'paid' },
      premium_economy: { state: 'inherited', mealService: 'paid' },
      business: { state: 'inherited', mealService: 'paid' },
      first: { state: 'inherited', mealService: 'paid' },
    },
  }
}

export function applyRouteOverrides(route: RouteSummary, settings: CabinSetting[]): RouteSummary {
  const out: RouteSummary = { ...route, cabinStatuses: { ...route.cabinStatuses } }
  for (const cabin of Object.keys(out.cabinStatuses) as Array<keyof typeof out.cabinStatuses>) {
    const row = settings.find((s) => s.scope === 'route' && s.routeId === route.id && s.cabin === cabin)
    const net = settings.find((s) => s.scope === 'network' && s.cabin === cabin)
    out.cabinStatuses[cabin] = {
      state: row ? 'custom' : 'inherited',
      mealService: (row?.mealService ?? net?.mealService ?? 'paid') as RouteSummary['cabinStatuses'][typeof cabin]['mealService'],
    }
  }
  return out
}

interface WireFlightSummary {
  id: string
  flight_number: string
  route_id: string
  scheduled_departure: string
  departure_airport?: string
  arrival_airport?: string
  has_exception?: boolean
  exception_summary?: string
}

export function mapFlightSummary(wire: WireFlightSummary): FlightSummary {
  return {
    id: wire.id,
    flightNumber: wire.flight_number,
    routeId: wire.route_id,
    scheduledDeparture: toIsoString(wire.scheduled_departure),
    departureAirport: wire.departure_airport ?? '',
    arrivalAirport: wire.arrival_airport ?? '',
    hasException: Boolean(wire.has_exception),
    exceptionSummary: wire.exception_summary ?? '',
  }
}

export function mapRouteDetail(
  route: RouteSummary | null,
  cabinSettings: CabinSetting[],
  offerings: ProductOffering[],
  flights: FlightSummary[],
): RouteDetail {
  return { route, cabinSettings, offerings, flights }
}

export function mapFlightException(wire: {
  id: string
  route_id: string
  flight_number: string
  scheduled_departure: string
  cabin: string
  changed_settings: string[]
}): FlightException {
  return {
    id: wire.id,
    routeId: wire.route_id,
    flightNumber: wire.flight_number,
    scheduledDeparture: toIsoString(wire.scheduled_departure),
    cabin: (wire.cabin as FlightException['cabin']) ?? 'economy',
    changedSettings: wire.changed_settings ?? [],
  }
}

// -- Catering orders ----------------------------------------------------------

interface WireCateringOrderLine {
  id: string
  cabin: string
  product_id: string
  product_name: string
  quantity_required: number
  quantity_short: number
  source?: string
}

interface WireCateringOrder {
  id: string
  flight_id: string
  flight_number: string
  route?: string
  departure_airport: string
  arrival_airport: string
  scheduled_departure: string
  passenger_count?: number
  status: string
  cutoff_at: string
  generated_at: string
  loaded_at: string | null
  warehouse_id: string
  aircraft_id: string
  cabin?: string
  lines: WireCateringOrderLine[]
}

export function mapCateringOrderLine(wire: WireCateringOrderLine): CateringOrderLine {
  return {
    id: wire.id,
    cabin: (wire.cabin as CateringOrderLine['cabin']) ?? 'all',
    productId: wire.product_id,
    productName: wire.product_name,
    quantityRequired: Number(wire.quantity_required),
    quantityShort: Number(wire.quantity_short),
    source: (wire.source as CateringOrderLine['source']) ?? 'order',
  }
}

export function mapCateringOrder(wire: WireCateringOrder): CateringOrder {
  return {
    id: wire.id,
    flightId: wire.flight_id,
    flightNumber: wire.flight_number,
    departureAirport: wire.departure_airport,
    arrivalAirport: wire.arrival_airport,
    scheduledDeparture: toIsoString(wire.scheduled_departure),
    passengerCount: wire.passenger_count == null ? 0 : Number(wire.passenger_count),
    status: (wire.status as CateringOrder['status']) ?? 'generated',
    cutoffAt: toIsoString(wire.cutoff_at),
    generatedAt: toIsoString(wire.generated_at),
    loadedAt: toNullableIsoString(wire.loaded_at),
    warehouseId: wire.warehouse_id,
    aircraftId: wire.aircraft_id,
    lines: wire.lines.map(mapCateringOrderLine),
  }
}

// -- Flight (offered menu / picker) ------------------------------------------

interface WireFlight {
  id: string
  flight_number: string
  route_id: string
  scheduled_departure: string
  departure_airport: string
  arrival_airport: string
  passenger_count?: number
  aircraft_id: string
  status?: string
  cabin?: string
  cutoff_at?: string
  warehouse_id?: string
  is_cancelled?: boolean
}

export function mapFlight(wire: WireFlight): Flight {
  return {
    id: wire.id,
    flightNumber: wire.flight_number,
    routeId: wire.route_id,
    scheduledDeparture: toIsoString(wire.scheduled_departure),
    departureAirport: wire.departure_airport,
    arrivalAirport: wire.arrival_airport,
    passengerCount: wire.passenger_count == null ? 0 : Number(wire.passenger_count),
    aircraftId: wire.aircraft_id,
    status: (wire.status as FlightCateringStatus) ?? 'open',
    cabin: (wire.cabin as Flight['cabin']) ?? 'economy',
    cutoffAt: toIsoString(wire.cutoff_at ?? wire.scheduled_departure),
    warehouseId: wire.warehouse_id ?? '',
    isCancelled: Boolean(wire.is_cancelled),
  }
}

// -- Aircraft stock / transfers / sales ---------------------------------------

interface WireAircraftStockRow {
  id: string
  aircraft_id: string
  product_id: string
  product_name: string
  stock_batch_id: string
  batch_code: string
  quantity: number
  expires_at: string | null
}

export function mapAircraftStockRow(wire: WireAircraftStockRow): AircraftStockRow {
  return {
    id: wire.id,
    aircraftId: wire.aircraft_id,
    productId: wire.product_id,
    productName: wire.product_name,
    stockBatchId: wire.stock_batch_id,
    batchCode: wire.batch_code,
    quantity: Number(wire.quantity),
    expiresAt: toNullableIsoString(wire.expires_at),
  }
}

interface WireStockTransfer {
  id: string
  flight_id: string
  aircraft_id: string
  warehouse_id: string
  transferred_at: string
  staff_id?: string
  lines: Array<{ id: string; product_id: string; stock_batch_id: string; quantity: number }>
}

export function mapStockTransfer(wire: WireStockTransfer): StockTransfer {
  return {
    id: wire.id,
    flightId: wire.flight_id,
    aircraftId: wire.aircraft_id,
    warehouseId: wire.warehouse_id,
    transferredAt: toIsoString(wire.transferred_at),
    lines: wire.lines.map((l): StockTransferLine => ({
      productId: l.product_id,
      stockBatchId: l.stock_batch_id,
      quantity: Number(l.quantity),
    })),
  }
}

interface WireProductSale {
  id: string
  flight_id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price_amount: number | string | { toNumber: () => number }
  unit_cost_amount?: number | string | { toNumber: () => number } | null
  total_amount: number | string | { toNumber: () => number }
  currency: string
  payment_id: string
  sold_at: string
}

export function mapProductSale(wire: WireProductSale): ProductSale {
  return {
    id: wire.id,
    flightId: wire.flight_id,
    productId: wire.product_id,
    productName: wire.product_name,
    quantity: Number(wire.quantity),
    unitPriceAmount: toNumber(wire.unit_price_amount),
    unitCostAmount: toNullableNumber(wire.unit_cost_amount),
    totalAmount: toNumber(wire.total_amount),
    currency: wire.currency,
    paymentId: wire.payment_id,
    soldAt: toIsoString(wire.sold_at),
  }
}

export function toCreateSaleInput(input: CreateFlightSaleInput): Record<string, unknown> {
  return {
    productId: input.productId,
    quantity: input.quantity,
    unitPriceAmount: input.unitPriceAmount,
  }
}

// -- Flight report ------------------------------------------------------------

interface WireFlightReportLine {
  id: string
  product_id: string
  product_name: string
  initial_quantity: number
  served: number
  sold: number
  wasted: number
  damaged: number
  remaining: number
}

interface WireFlightReport {
  id: string
  flight_id: string
  flight_number: string
  route: string
  status: string
  submitted_at: string | null
  lines: WireFlightReportLine[]
}

export function mapFlightReport(wire: WireFlightReport): FlightReport {
  return {
    id: wire.id,
    flightId: wire.flight_id,
    flightNumber: wire.flight_number,
    route: wire.route,
    status: (wire.status as FlightReportStatus) ?? 'submitted',
    submittedAt: toNullableIsoString(wire.submitted_at),
    lines: wire.lines.map((l): FlightReportLine => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name,
      initialQuantity: Number(l.initial_quantity),
      served: Number(l.served),
      sold: Number(l.sold),
      wasted: Number(l.wasted),
      damaged: Number(l.damaged),
      remaining: Number(l.remaining),
    })),
  }
}

// -- Warehouse stock (derived from batches, since the backend has no
//    dedicated /warehouse-stock endpoint) -------------------------------

export function summarizeWarehouseStock(warehouseId: string, products: Product[], batches: StockBatch[]): WarehouseStockRow[] {
  const byProduct = new Map<string, number>()
  for (const b of batches) {
    if (b.warehouseId !== warehouseId) continue
    if (b.quantityRemaining <= 0) continue
    byProduct.set(b.productId, (byProduct.get(b.productId) ?? 0) + b.quantityRemaining)
  }
  return Array.from(byProduct.entries()).map(([productId, qty], idx) => {
    const product = products.find((p) => p.id === productId)
    return {
      id: `ws-${warehouseId}-${productId}-${idx}`,
      warehouseId,
      productId,
      productName: product?.name ?? productId,
      productCategory: product?.category ?? 'meal',
      quantityOnHand: qty,
      quantityReserved: 0,
      reorderLevel: 10,
    }
  })
}
