// Per-area mappers: wire format (camelCase, ISO dates, decimal strings)
// → frontend types (camelCase, ISO strings, numbers). Backend emits
// camelCase (see the auth module's `{ accessToken, user: { id, email, type } }`
// for reference). Each `mapXxx` accepts the camelCase wire shape and
// returns the camelCase UI shape; the inverse `toXxxInput` maps the UI
// shape back to the wire shape for PUT/POST bodies.

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

// -- Error: required field is missing on the wire -----------------------

export class MapperError extends Error {
  readonly endpoint: string
  readonly field: string
  constructor(endpoint: string, field: string) {
    super(`Mapper for ${endpoint} received undefined for required field "${field}"`)
    this.name = 'MapperError'
    this.endpoint = endpoint
    this.field = field
  }
}

function required<T>(endpoint: string, field: string, value: T | undefined | null): T {
  if (value === undefined || value === null || value === '') {
    throw new MapperError(endpoint, field)
  }
  return value as T
}

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
  typeCode: string
  name: string
  description?: string | null
  priceAmount: number | string | { toNumber: () => number }
  purchaseCostAmount?: number | string | { toNumber: () => number } | null
  shelfLifeDays?: number | null
  isPremium: boolean
  isActive: boolean
  imageKey?: string | null
  dietaryAttributes?: string[]
  isInUse?: boolean
}

export function mapProduct(wire: WireProduct): Product {
  return {
    id: required('GET /api/staff/products', 'id', wire.id),
    sku: required('GET /api/staff/products', 'sku', wire.sku),
    category: required('GET /api/staff/products', 'category', wire.category) as ProductCategory,
    typeCode: required('GET /api/staff/products', 'typeCode', wire.typeCode) as SpecialMealCode,
    name: required('GET /api/staff/products', 'name', wire.name),
    description: wire.description ?? null,
    priceAmount: toNumber(wire.priceAmount),
    purchaseCostAmount: toNullableNumber(wire.purchaseCostAmount),
    shelfLifeDays: wire.shelfLifeDays == null ? null : Number(wire.shelfLifeDays),
    isPremium: Boolean(wire.isPremium),
    isActive: Boolean(wire.isActive),
    imageKey: wire.imageKey ?? null,
    dietaryAttributes: toDietary(wire.dietaryAttributes),
    isInUse: wire.isInUse,
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
  airportCode: string
}

export function mapWarehouse(wire: WireWarehouse): Warehouse {
  return {
    id: required('GET /api/staff/warehouses', 'id', wire.id),
    code: required('GET /api/staff/warehouses', 'code', wire.code),
    name: required('GET /api/staff/warehouses', 'name', wire.name),
    airportCode: required('GET /api/staff/warehouses', 'airportCode', wire.airportCode),
  }
}

interface WireSupplier {
  id: string
  name: string
  airportCode: string
  contact?: string | null
  isActive?: boolean
}

export function mapSupplier(wire: WireSupplier): Supplier {
  return {
    id: required('GET /api/staff/suppliers', 'id', wire.id),
    name: required('GET /api/staff/suppliers', 'name', wire.name),
    airportCode: required('GET /api/staff/suppliers', 'airportCode', wire.airportCode),
    contact: wire.contact ?? null,
    isActive: wire.isActive ?? true,
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
  purchaseReceiptId: string
  warehouseId: string
  productId: string
  batchCode: string
  quantityReceived: number
  quantityRemaining: number
  unitCostAmount: number | string | { toNumber: () => number }
  receivedAt: string
  expiresAt: string | null
  isDamaged: boolean
}

export function mapStockBatch(wire: WireStockBatch): StockBatch {
  return {
    id: required('GET /api/staff/stock-batches', 'id', wire.id),
    purchaseReceiptId: required('GET /api/staff/stock-batches', 'purchaseReceiptId', wire.purchaseReceiptId),
    warehouseId: required('GET /api/staff/stock-batches', 'warehouseId', wire.warehouseId),
    productId: required('GET /api/staff/stock-batches', 'productId', wire.productId),
    batchCode: required('GET /api/staff/stock-batches', 'batchCode', wire.batchCode),
    quantityReceived: Number(wire.quantityReceived),
    quantityRemaining: Number(wire.quantityRemaining),
    unitCostAmount: toNumber(wire.unitCostAmount),
    receivedAt: toIsoString(wire.receivedAt),
    expiresAt: toNullableIsoString(wire.expiresAt),
    isDamaged: Boolean(wire.isDamaged),
  }
}

// -- Stock movements -----------------------------------------------------------

interface WireStockMovement {
  id: string
  productId: string
  warehouseId: string | null
  aircraftId: string | null
  stockBatchId: string | null
  stockTransferId: string | null
  productOrderId: string | null
  flightId: string | null
  type: string
  quantity: number
  reason: string | null
  note: string | null
  createdByStaffId: string | null
  occurredAt: string
}

export function mapStockMovement(wire: WireStockMovement): StockMovement {
  return {
    id: required('GET /api/staff/stock-movements', 'id', wire.id),
    productId: required('GET /api/staff/stock-movements', 'productId', wire.productId),
    warehouseId: wire.warehouseId,
    aircraftId: wire.aircraftId,
    stockBatchId: wire.stockBatchId,
    stockTransferId: wire.stockTransferId,
    productOrderId: wire.productOrderId,
    flightId: wire.flightId,
    type: required('GET /api/staff/stock-movements', 'type', wire.type) as StockMovementType,
    quantity: Number(wire.quantity),
    reason: (wire.reason as StockMovement['reason']) ?? null,
    note: wire.note,
    createdByStaffId: wire.createdByStaffId,
    occurredAt: toIsoString(wire.occurredAt),
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
  productId: string
  productName: string
  quantity: number
  unitCostAmount: number | string | { toNumber: () => number }
  batchCode: string
  expiresAt: string | null
  lineTotal?: number | string | { toNumber: () => number }
}

interface WirePurchaseReceipt {
  id: string
  supplierId: string
  warehouseId: string
  receivedAt: string
  receivedByStaffId: string | null
  lines: WirePurchaseReceiptLine[]
}

export function mapPurchaseReceipt(wire: WirePurchaseReceipt): PurchaseReceipt {
  return {
    id: required('GET /api/staff/purchase-receipts', 'id', wire.id),
    supplierId: required('GET /api/staff/purchase-receipts', 'supplierId', wire.supplierId),
    warehouseId: required('GET /api/staff/purchase-receipts', 'warehouseId', wire.warehouseId),
    receivedAt: toIsoString(wire.receivedAt),
    receivedByStaffId: wire.receivedByStaffId,
    lines: wire.lines.map(mapPurchaseReceiptLine),
  }
}

export function mapPurchaseReceiptLine(wire: WirePurchaseReceiptLine): PurchaseReceiptLine {
  return {
    productId: required('POST /api/staff/purchase-receipts', 'productId', wire.productId),
    productName: required('POST /api/staff/purchase-receipts', 'productName', wire.productName),
    quantity: Number(wire.quantity),
    unitCostAmount: toNumber(wire.unitCostAmount),
    batchCode: required('POST /api/staff/purchase-receipts', 'batchCode', wire.batchCode),
    expiresAt: toNullableIsoString(wire.expiresAt),
    lineTotal: wire.lineTotal == null ? Number(wire.quantity) * toNumber(wire.unitCostAmount) : toNumber(wire.lineTotal),
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
  productId: string
  scope: string
  routeId: string | null
  flightId: string | null
  cabin: string
  isDefault: boolean
  isActive: boolean
}

export function mapOffering(wire: WireOffering): ProductOffering {
  return {
    id: required('GET /api/staff/product-offerings', 'id', wire.id),
    productId: required('GET /api/staff/product-offerings', 'productId', wire.productId),
    scope: required('GET /api/staff/product-offerings', 'scope', wire.scope) as ProductOffering['scope'],
    routeId: wire.routeId,
    flightId: wire.flightId,
    cabin: required('GET /api/staff/product-offerings', 'cabin', wire.cabin) as ProductOffering['cabin'],
    isDefault: Boolean(wire.isDefault),
    isActive: Boolean(wire.isActive),
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
  routeId: string | null
  flightId: string | null
  cabin: string
  mealService: string | null
  mealSelection: string | null
  includedPerPassenger: number | null
  preorderEnabled: boolean | null
  orderWindowHours: number | null
  premiumMealsAllowed: boolean | null
  snacksEnabled: boolean | null
  dutyFreeEnabled: boolean | null
  onboardBufferPercent: number | null
  // Backend may return how many open orders this upsert affected; the
  // previous frontend hardcoded this to 0. Surface whatever the wire
  // says; fall back to 0 only if the field is genuinely absent.
  affectedOpenOrders?: number
}

export function mapCabinSetting(wire: WireCabinSetting): CabinSetting {
  return {
    id: required('GET /api/staff/cabin-settings', 'id', wire.id),
    scope: required('GET /api/staff/cabin-settings', 'scope', wire.scope) as CabinSetting['scope'],
    routeId: wire.routeId,
    flightId: wire.flightId,
    cabin: required('GET /api/staff/cabin-settings', 'cabin', wire.cabin) as CabinSetting['cabin'],
    mealService: (wire.mealService as CabinSetting['mealService']) ?? null,
    mealSelection: (wire.mealSelection as CabinSetting['mealSelection']) ?? null,
    includedPerPassenger: wire.includedPerPassenger == null ? null : Number(wire.includedPerPassenger),
    preorderEnabled: wire.preorderEnabled,
    orderWindowHours: wire.orderWindowHours == null ? null : Number(wire.orderWindowHours),
    premiumMealsAllowed: wire.premiumMealsAllowed,
    snacksEnabled: wire.snacksEnabled,
    dutyFreeEnabled: wire.dutyFreeEnabled,
    onboardBufferPercent: wire.onboardBufferPercent == null ? null : Number(wire.onboardBufferPercent),
  } as CabinSetting
}

/**
 * Pull the affected-open-orders count off the cabin-setting response.
 * The wire may name this `affectedOpenOrders`; if the backend hasn't
 * started returning it yet this returns 0.
 */
export function readAffectedOpenOrders(wire: unknown): number {
  if (wire && typeof wire === 'object' && 'affectedOpenOrders' in wire) {
    const v = (wire as { affectedOpenOrders: unknown }).affectedOpenOrders
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
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
  originAirport: string
  destinationAirport: string
  originCity: string
  destinationCity: string
}

export function mapRoute(wire: WireRoute): RouteSummary {
  // cabinStatuses is filled in by the caller from cabin_settings rows via
  // `applyRouteOverrides`. Keep it empty here so the route's state is
  // never silently hardcoded; if the caller forgets to apply overrides,
  // the page will see an empty object and the row will render as '—'
  // instead of lying with a fake 'paid' value.
  return {
    id: required('GET /api/staff/routes', 'id', wire.id),
    originAirport: required('GET /api/staff/routes', 'originAirport', wire.originAirport),
    destinationAirport: required('GET /api/staff/routes', 'destinationAirport', wire.destinationAirport),
    originCity: required('GET /api/staff/routes', 'originCity', wire.originCity),
    destinationCity: required('GET /api/staff/routes', 'destinationCity', wire.destinationCity),
    cabinStatuses: {} as RouteSummary['cabinStatuses'],
  }
}

export function applyRouteOverrides(route: RouteSummary, settings: CabinSetting[]): RouteSummary {
  const CABIN_KEYS: Array<keyof RouteSummary['cabinStatuses']> = ['economy', 'premium_economy', 'business', 'first']
  const out: RouteSummary = {
    ...route,
    cabinStatuses: { ...route.cabinStatuses } as RouteSummary['cabinStatuses'],
  }
  for (const cabin of CABIN_KEYS) {
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
  flightNumber: string
  routeId: string
  scheduledDeparture: string
  departureAirport?: string
  arrivalAirport?: string
  hasException?: boolean
  exceptionSummary?: string
}

export function mapFlightSummary(wire: WireFlightSummary): FlightSummary {
  return {
    id: required('GET /api/staff/routes/:routeId/flights', 'id', wire.id),
    flightNumber: required('GET /api/staff/routes/:routeId/flights', 'flightNumber', wire.flightNumber),
    routeId: required('GET /api/staff/routes/:routeId/flights', 'routeId', wire.routeId),
    scheduledDeparture: toIsoString(wire.scheduledDeparture),
    departureAirport: wire.departureAirport ?? '',
    arrivalAirport: wire.arrivalAirport ?? '',
    hasException: Boolean(wire.hasException),
    exceptionSummary: wire.exceptionSummary ?? '',
  }
}

// One row of the new GET /api/staff/routes/:routeId/flights endpoint.
export interface RouteFlight {
  id: string
  flightNumber: string
  routeId: string
  scheduledDeparture: string
  aircraftId: string
  status: string
}

export function mapRouteFlight(wire: {
  id: string
  flightNumber: string
  routeId: string
  scheduledDeparture: string
  aircraftId: string
  status: string
}): RouteFlight {
  return {
    id: required('GET /api/staff/routes/:routeId/flights', 'id', wire.id),
    flightNumber: required('GET /api/staff/routes/:routeId/flights', 'flightNumber', wire.flightNumber),
    routeId: required('GET /api/staff/routes/:routeId/flights', 'routeId', wire.routeId),
    scheduledDeparture: toIsoString(wire.scheduledDeparture),
    aircraftId: required('GET /api/staff/routes/:routeId/flights', 'aircraftId', wire.aircraftId),
    status: required('GET /api/staff/routes/:routeId/flights', 'status', wire.status),
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
  routeId: string
  flightNumber: string
  scheduledDeparture: string
  cabin: string
  changedSettings: string[]
  route?: string
}): FlightException {
  return {
    id: required('GET /api/staff/flight-exceptions', 'id', wire.id),
    routeId: required('GET /api/staff/flight-exceptions', 'routeId', wire.routeId),
    flightNumber: required('GET /api/staff/flight-exceptions', 'flightNumber', wire.flightNumber),
    scheduledDeparture: toIsoString(wire.scheduledDeparture),
    cabin: required('GET /api/staff/flight-exceptions', 'cabin', wire.cabin) as FlightException['cabin'],
    changedSettings: Array.isArray(wire.changedSettings) ? wire.changedSettings : [],
    route: wire.route ?? '',
  }
}

// -- Catering orders ----------------------------------------------------------

interface WireCateringOrderLine {
  id: string
  cabin: string
  productId: string
  productName: string
  quantityRequired: number
  quantityShort: number
  source?: string
}

interface WireCateringOrder {
  id: string
  flightId: string
  flightNumber: string
  route?: string
  departureAirport: string
  arrivalAirport: string
  scheduledDeparture: string
  passengerCount?: number
  status: string
  cutoffAt: string
  generatedAt: string
  loadedAt: string | null
  warehouseId: string
  aircraftId: string
  cabin?: string
  lines: WireCateringOrderLine[]
}

export function mapCateringOrderLine(wire: WireCateringOrderLine): CateringOrderLine {
  return {
    id: required('GET /api/staff/catering-orders/flight/:id', 'id', wire.id),
    cabin: required('GET /api/staff/catering-orders/flight/:id', 'cabin', wire.cabin) as CateringOrderLine['cabin'],
    productId: required('GET /api/staff/catering-orders/flight/:id', 'productId', wire.productId),
    productName: required('GET /api/staff/catering-orders/flight/:id', 'productName', wire.productName),
    quantityRequired: Number(wire.quantityRequired),
    quantityShort: Number(wire.quantityShort),
    source: ((wire.source as CateringOrderLine['source']) ?? 'order') as CateringOrderLine['source'],
  }
}

export function mapCateringOrder(wire: WireCateringOrder): CateringOrder {
  return {
    id: required('GET /api/staff/catering-orders/flight/:id', 'id', wire.id),
    flightId: required('GET /api/staff/catering-orders/flight/:id', 'flightId', wire.flightId),
    flightNumber: required('GET /api/staff/catering-orders/flight/:id', 'flightNumber', wire.flightNumber),
    departureAirport: required('GET /api/staff/catering-orders/flight/:id', 'departureAirport', wire.departureAirport),
    arrivalAirport: required('GET /api/staff/catering-orders/flight/:id', 'arrivalAirport', wire.arrivalAirport),
    scheduledDeparture: toIsoString(wire.scheduledDeparture),
    passengerCount: wire.passengerCount == null ? 0 : Number(wire.passengerCount),
    status: required('GET /api/staff/catering-orders/flight/:id', 'status', wire.status) as CateringOrder['status'],
    cutoffAt: toIsoString(wire.cutoffAt),
    generatedAt: toIsoString(wire.generatedAt),
    loadedAt: toNullableIsoString(wire.loadedAt),
    warehouseId: required('GET /api/staff/catering-orders/flight/:id', 'warehouseId', wire.warehouseId),
    aircraftId: required('GET /api/staff/catering-orders/flight/:id', 'aircraftId', wire.aircraftId),
    lines: wire.lines.map(mapCateringOrderLine),
  }
}

// -- Flight (offered menu / picker) ------------------------------------------

interface WireFlight {
  id: string
  flightId: string
  flightNumber: string
  routeId: string
  scheduledDeparture: string
  departureAirport: string
  arrivalAirport: string
  passengerCount?: number
  aircraftId: string
  status?: string
  cabin?: string
  cutoffAt?: string
  warehouseId?: string
  isCancelled?: boolean
}

export function mapFlight(wire: WireFlight): Flight {
  return {
    // The list endpoint returns one catering order per flight, so `id` is the
    // order id and `flightId` is the flight. The page keys the flight list by
    // flight id (it loads the order for it), so that is what `id` has to be.
    id: required('GET /api/staff/catering-orders', 'flightId', wire.flightId),
    flightNumber: required('GET /api/staff/catering-orders', 'flightNumber', wire.flightNumber),
    routeId: required('GET /api/staff/catering-orders', 'routeId', wire.routeId),
    scheduledDeparture: toIsoString(wire.scheduledDeparture),
    departureAirport: required('GET /api/staff/catering-orders', 'departureAirport', wire.departureAirport),
    arrivalAirport: required('GET /api/staff/catering-orders', 'arrivalAirport', wire.arrivalAirport),
    passengerCount: wire.passengerCount == null ? 0 : Number(wire.passengerCount),
    aircraftId: required('GET /api/staff/catering-orders', 'aircraftId', wire.aircraftId),
    status: (required('GET /api/staff/catering-orders', 'status', wire.status) as FlightCateringStatus) ?? 'open',
    cabin: (required('GET /api/staff/catering-orders', 'cabin', wire.cabin ?? 'economy') as Flight['cabin']) ?? 'economy',
    cutoffAt: toIsoString(wire.cutoffAt ?? wire.scheduledDeparture),
    // Empty until a catering order exists for the flight, so it is not required.
    warehouseId: wire.warehouseId ?? '',
    isCancelled: Boolean(wire.isCancelled),
  }
}

// -- Aircraft stock / transfers / sales ---------------------------------------

interface WireAircraftStockRow {
  id: string
  aircraftId: string
  productId: string
  productName: string
  stockBatchId: string
  batchCode: string
  quantity: number
  expiresAt: string | null
}

export function mapAircraftStockRow(wire: WireAircraftStockRow): AircraftStockRow {
  return {
    id: required('GET /api/staff/aircraft-stock/:id', 'id', wire.id),
    aircraftId: required('GET /api/staff/aircraft-stock/:id', 'aircraftId', wire.aircraftId),
    productId: required('GET /api/staff/aircraft-stock/:id', 'productId', wire.productId),
    productName: required('GET /api/staff/aircraft-stock/:id', 'productName', wire.productName),
    stockBatchId: required('GET /api/staff/aircraft-stock/:id', 'stockBatchId', wire.stockBatchId),
    batchCode: required('GET /api/staff/aircraft-stock/:id', 'batchCode', wire.batchCode),
    quantity: Number(wire.quantity),
    expiresAt: toNullableIsoString(wire.expiresAt),
  }
}

interface WireStockTransfer {
  id: string
  flightId: string
  aircraftId: string
  warehouseId: string
  transferredAt: string
  staffId?: string
  lines: Array<{ id: string; productId: string; stockBatchId: string; quantity: number }>
}

export function mapStockTransfer(wire: WireStockTransfer): StockTransfer {
  return {
    id: required('GET /api/staff/stock-transfers/flight/:id', 'id', wire.id),
    flightId: required('GET /api/staff/stock-transfers/flight/:id', 'flightId', wire.flightId),
    aircraftId: required('GET /api/staff/stock-transfers/flight/:id', 'aircraftId', wire.aircraftId),
    warehouseId: required('GET /api/staff/stock-transfers/flight/:id', 'warehouseId', wire.warehouseId),
    transferredAt: toIsoString(wire.transferredAt),
    lines: wire.lines.map((l): StockTransferLine => ({
      productId: l.productId,
      stockBatchId: l.stockBatchId,
      quantity: Number(l.quantity),
    })),
  }
}

interface WireProductSale {
  id: string
  flightId: string
  productId: string
  productName: string
  quantity: number
  unitPriceAmount: number | string | { toNumber: () => number }
  unitCostAmount?: number | string | { toNumber: () => number } | null
  totalAmount: number | string | { toNumber: () => number }
  currency: string
  paymentId: string
  soldAt: string
}

export function mapProductSale(wire: WireProductSale): ProductSale {
  return {
    id: required('GET /api/staff/sales/flight/:id', 'id', wire.id),
    flightId: required('GET /api/staff/sales/flight/:id', 'flightId', wire.flightId),
    productId: required('GET /api/staff/sales/flight/:id', 'productId', wire.productId),
    productName: required('GET /api/staff/sales/flight/:id', 'productName', wire.productName),
    quantity: Number(wire.quantity),
    unitPriceAmount: toNumber(wire.unitPriceAmount),
    unitCostAmount: toNullableNumber(wire.unitCostAmount),
    totalAmount: toNumber(wire.totalAmount),
    currency: required('GET /api/staff/sales/flight/:id', 'currency', wire.currency),
    paymentId: required('GET /api/staff/sales/flight/:id', 'paymentId', wire.paymentId),
    soldAt: toIsoString(wire.soldAt),
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
  productId: string
  productName: string
  initialQuantity: number
  served: number
  sold: number
  wasted: number
  damaged: number
  remaining: number
}

interface WireFlightReport {
  id: string
  flightId: string
  flightNumber: string
  route: string
  status: string
  submittedAt: string | null
  lines: WireFlightReportLine[]
}

export function mapFlightReport(wire: WireFlightReport): FlightReport {
  return {
    id: required('GET /api/staff/flight-reports/flight/:id', 'id', wire.id),
    flightId: required('GET /api/staff/flight-reports/flight/:id', 'flightId', wire.flightId),
    flightNumber: required('GET /api/staff/flight-reports/flight/:id', 'flightNumber', wire.flightNumber),
    route: required('GET /api/staff/flight-reports/flight/:id', 'route', wire.route),
    status: required('GET /api/staff/flight-reports/flight/:id', 'status', wire.status) as FlightReportStatus,
    submittedAt: toNullableIsoString(wire.submittedAt),
    lines: wire.lines.map((l): FlightReportLine => ({
      id: l.id,
      productId: required('GET /api/staff/flight-reports/flight/:id', 'productId', l.productId),
      productName: required('GET /api/staff/flight-reports/flight/:id', 'productName', l.productName),
      initialQuantity: Number(l.initialQuantity),
      served: Number(l.served),
      sold: Number(l.sold),
      wasted: Number(l.wasted),
      damaged: Number(l.damaged),
      remaining: Number(l.remaining),
    })),
  }
}

// -- Write-off (response of PUT /api/staff/stock-batches/write-off-expired) --

interface WireWriteOffBatch {
  id: string
  productId: string
  batchCode: string
  quantityRemaining: number
  expiresAt: string | null
  warehouseId: string
}

export interface WriteOffBatch {
  id: string
  productId: string
  batchCode: string
  quantityRemaining: number
  expiresAt: string | null
  warehouseId: string
}

export function mapWriteOffBatch(wire: WireWriteOffBatch): WriteOffBatch {
  return {
    id: required('PUT /api/staff/stock-batches/write-off-expired', 'id', wire.id),
    productId: required('PUT /api/staff/stock-batches/write-off-expired', 'productId', wire.productId),
    batchCode: required('PUT /api/staff/stock-batches/write-off-expired', 'batchCode', wire.batchCode),
    quantityRemaining: Number(wire.quantityRemaining),
    expiresAt: toNullableIsoString(wire.expiresAt),
    warehouseId: required('PUT /api/staff/stock-batches/write-off-expired', 'warehouseId', wire.warehouseId),
  }
}

// -- Reportable flights (response of /api/staff/flight-reports/reportable-flights) --

export interface ReportableFlight {
  id: string
  flightNumber: string
  routeId: string
  departureAirport: string
  arrivalAirport: string
  scheduledDeparture: string
  aircraftId: string
  reportSubmitted: boolean
}

export function mapReportableFlight(wire: {
  id: string
  flightNumber: string
  routeId: string
  departureAirport: string
  arrivalAirport: string
  scheduledDeparture: string
  aircraftId: string
  reportSubmitted: boolean
}): ReportableFlight {
  return {
    id: required('GET /api/staff/flight-reports/reportable-flights', 'id', wire.id),
    flightNumber: required('GET /api/staff/flight-reports/reportable-flights', 'flightNumber', wire.flightNumber),
    routeId: required('GET /api/staff/flight-reports/reportable-flights', 'routeId', wire.routeId),
    departureAirport: required('GET /api/staff/flight-reports/reportable-flights', 'departureAirport', wire.departureAirport),
    arrivalAirport: required('GET /api/staff/flight-reports/reportable-flights', 'arrivalAirport', wire.arrivalAirport),
    scheduledDeparture: toIsoString(wire.scheduledDeparture),
    aircraftId: required('GET /api/staff/flight-reports/reportable-flights', 'aircraftId', wire.aircraftId),
    reportSubmitted: Boolean(wire.reportSubmitted),
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
