// Why a product cannot be deleted yet.
//
// The rule is pure so it can be unit tested without a database: the
// service only counts the rows and asks this function for the reason.

export interface ProductInUseCounts {
  // Stock in a warehouse (on hand, or a batch with something left).
  warehouseStock: number
  // Stock on an aircraft.
  aircraftStock: number
  // Lines of a customer order that is still open (pending payment or
  // confirmed).
  openCustomerOrder: number
  // Lines of a catering order that is not closed or voided yet.
  openCateringOrder: number
}

export type ProductInUseReason = 'warehouse_stock' | 'aircraft_stock' | 'customer_order' | 'catering_order'

// The first reason the product is still in use, or null when it can
// be deleted.
export function productInUseReason(counts: ProductInUseCounts): ProductInUseReason | null {
  if (counts.warehouseStock > 0) return 'warehouse_stock'
  if (counts.aircraftStock > 0) return 'aircraft_stock'
  if (counts.openCustomerOrder > 0) return 'customer_order'
  if (counts.openCateringOrder > 0) return 'catering_order'
  return null
}

// The message the staff member sees.
export function productInUseMessage(reason: ProductInUseReason): string {
  switch (reason) {
    case 'warehouse_stock':
      return 'Product still has stock in a warehouse.'
    case 'aircraft_stock':
      return 'Product is still on an aircraft.'
    case 'customer_order':
      return 'Product is on an open customer order.'
    case 'catering_order':
      return 'Product is on a catering order that is not closed yet.'
  }
}
