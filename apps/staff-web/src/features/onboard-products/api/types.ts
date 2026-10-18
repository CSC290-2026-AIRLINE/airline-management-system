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
  quantityOnHand: number
  quantityReserved: number
  reorderLevel: number
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
