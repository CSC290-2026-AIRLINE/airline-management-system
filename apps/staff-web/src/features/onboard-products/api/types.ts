// Shared types for the onboard-products feature.
// Field names follow the snake_case tables in the F12 spec, exposed in camelCase for the UI.

export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'

export type ProductCategory = 'meal' | 'snack' | 'beverage' | 'duty_free'

export type SpecialMealCode = 'STD' | 'VGML' | 'MOML' | 'KSML' | 'DBML' | 'GFML'

export type DietaryAttribute = 'halal' | 'vegetarian' | 'vegan' | 'kosher' | 'diabetic' | 'gluten_free'

export type OfferingScope = 'network' | 'route' | 'flight'

export type MealService = 'complimentary' | 'paid' | 'none'

export type MealSelection = 'choose' | 'fixed'

export type CateringOrderStatus = 'generated' | 'loaded' | 'closed' | 'void'

export type FlightReportStatus = 'submitted' | 'void'

export type StockMovementType = 'receive' | 'reserve' | 'release' | 'transfer' | 'discard' | 'adjust'

export type StockMovementReason = 'spoilage' | 'damage' | 'expired' | 'count_correction' | null

export interface Product {
  id: string
  sku: string
  category: ProductCategory
  typeCode: SpecialMealCode
  name: string
  description: string | null
  priceAmount: number
  purchaseCostAmount: number | null
  shelfLifeDays: number | null
  isPremium: boolean
  isActive: boolean
  imageKey: string | null
  dietaryAttributes: DietaryAttribute[]
  // Mock-only flag: true when the product has stock or open orders, so the
  // backend would refuse DELETE with PRODUCT_IN_USE. Remove when wiring the
  // real backend (the real error comes back over the wire).
  isInUse?: boolean
}

// A locally-staged photo. The mock store keeps the data URL so the page
// can preview it; the real backend stores the resized image under imageKey.
export interface ProductPhoto {
  dataUrl: string
  fileName: string
}

export interface ProductInput {
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
  photo: ProductPhoto | null
}

export interface ProductOffering {
  id: string
  productId: string
  scope: OfferingScope
  routeId: string | null
  flightId: string | null
  cabin: Cabin
  isDefault: boolean
  isActive: boolean
}

export interface CabinSetting {
  id: string
  scope: OfferingScope
  routeId: string | null
  flightId: string | null
  cabin: Cabin
  mealService: MealService | null
  mealSelection: MealSelection | null
  includedPerPassenger: number | null
  preorderEnabled: boolean | null
  orderWindowHours: number | null
  premiumMealsAllowed: boolean | null
  snacksEnabled: boolean | null
  dutyFreeEnabled: boolean | null
  onboardBufferPercent: number | null
}

export interface RouteCabinStatus {
  state: 'inherited' | 'custom'
  mealService: MealService
}

export interface RouteSummary {
  id: string
  originAirport: string
  destinationAirport: string
  originCity: string
  destinationCity: string
  cabinStatuses: Record<Cabin, RouteCabinStatus>
}

// Filter the routes table on the Offered menu page.
export interface RouteFilter {
  search: string
  cabin: 'all' | Cabin
  mealProductId: string | null
  mealService: 'all' | MealService
  status: 'all' | 'customized' | 'inherited'
}

// A single flight, used by Route detail's flight picker and the
// Single-flight exceptions table on Offered menu.
export interface FlightSummary {
  id: string
  flightNumber: string
  routeId: string
  scheduledDeparture: string
  departureAirport: string
  arrivalAirport: string
  // True when this flight overrides its route with a non-empty cabin setting or offering.
  hasException: boolean
  exceptionSummary: string
}

// Detail for a single-flight exception row, what changed vs the route default.
export interface FlightException {
  id: string
  routeId: string
  flightNumber: string
  scheduledDeparture: string
  cabin: Cabin
  changedSettings: string[]
}

export interface CateringOrderLine {
  id: string
  cabin: Cabin
  productId: string
  productName: string
  quantityRequired: number
  quantityShort: number
  source: 'order' | 'default'
}

export interface CateringOrder {
  id: string
  flightId: string
  flightNumber: string
  departureAirport: string
  arrivalAirport: string
  scheduledDeparture: string
  passengerCount: number
  status: CateringOrderStatus
  cutoffAt: string
  generatedAt: string
  warehouseId: string
  lines: CateringOrderLine[]
}

export interface Warehouse {
  id: string
  code: string
  name: string
  airportCode: string
}

export interface Supplier {
  id: string
  name: string
  airportCode: string
  contact: string | null
  isActive: boolean
}

export interface WarehouseStockRow {
  id: string
  warehouseId: string
  productId: string
  productName: string
  productCategory: ProductCategory
  quantityOnHand: number
  quantityReserved: number
  reorderLevel: number
}

// A single batch of stock sitting in a warehouse. On hand always equals
// the sum of a warehouse's batches per product; both move together.
export interface StockBatch {
  id: string
  purchaseReceiptId: string
  warehouseId: string
  productId: string
  batchCode: string
  quantityReceived: number
  quantityRemaining: number
  unitCostAmount: number
  receivedAt: string
  expiresAt: string | null
  isDamaged: boolean
}

// Append-only ledger row. Each row changes one place; a transfer is two rows.
export interface StockMovement {
  id: string
  productId: string
  warehouseId: string | null
  aircraftId: string | null
  stockBatchId: string | null
  stockTransferId: string | null
  productOrderId: string | null
  flightId: string | null
  type: StockMovementType
  // Signed: positive for inbound (receive), negative for outbound
  // (adjust, transfer out, reserve/release) and discard.
  quantity: number
  reason: StockMovementReason
  note: string | null
  createdByStaffId: string | null
  occurredAt: string
}

export interface PurchaseReceipt {
  id: string
  supplierId: string
  warehouseId: string
  receivedAt: string
  receivedByStaffId: string | null
  lines: PurchaseReceiptLine[]
}

export interface PurchaseReceiptLine {
  productId: string
  productName: string
  quantity: number
  unitCostAmount: number
  batchCode: string
  expiresAt: string | null
  lineTotal: number
}

// A draft row on the Receive delivery page. The form builds these before
// they are sent to createPurchaseReceipt.
export interface PurchaseReceiptDraftLine {
  productId: string
  quantity: number
  unitCostAmount: number
  // ISO date (YYYY-MM-DD) or null when the product has no expiry.
  expiresAt: string | null
}

export interface CreatePurchaseReceiptInput {
  supplierId: string
  warehouseId: string
  lines: PurchaseReceiptDraftLine[]
}

export interface AdjustStockInput {
  warehouseId: string
  productId: string
  // Always positive -- the API negates it to write the movement.
  quantity: number
  reason: NonNullable<StockMovementReason>
  note: string | null
}

export interface FlightReportLine {
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

export interface FlightReport {
  id: string
  flightId: string
  flightNumber: string
  route: string
  status: FlightReportStatus
  submittedAt: string | null
  lines: FlightReportLine[]
}

// A small shared error envelope matching the spec's `{ error: { code, message, details? } }`.
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

// Setting patch shape: every key is optional, and `null` is a valid value for
// the route/flight scopes (it means "inherit from the next level up"). Re-
// exported here so the UI can `import type { SettingPatch } from '.../types'`.
export type SettingPatch = {
  [
    K in
      | 'mealService'
      | 'mealSelection'
      | 'includedPerPassenger'
      | 'preorderEnabled'
      | 'orderWindowHours'
      | 'premiumMealsAllowed'
      | 'snacksEnabled'
      | 'dutyFreeEnabled'
      | 'onboardBufferPercent'
  ]?: NonNullable<CabinSetting[K]>
}

// Route detail as returned by the API. Lives in types so the page can use
// the same shape without re-importing the API module.
export interface RouteDetail {
  route: RouteSummary | null
  cabinSettings: CabinSetting[]
  offerings: ProductOffering[]
  flights: FlightSummary[]
}
