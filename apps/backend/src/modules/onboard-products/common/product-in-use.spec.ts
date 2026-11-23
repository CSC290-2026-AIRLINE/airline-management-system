// Tests for the product delete check.
//
// A product can only be deleted when nothing refers to it any more:
// not the stock in a warehouse, not the stock on an aircraft, not an
// open customer order and not a catering order that is not closed yet.
// The rule is pure, so no database is needed to test it.

import { productInUseMessage, productInUseReason, type ProductInUseCounts } from './product-in-use'

const FREE: ProductInUseCounts = {
  warehouseStock: 0,
  aircraftStock: 0,
  openCustomerOrder: 0,
  openCateringOrder: 0,
}

describe('productInUseReason', () => {
  it('lets a product with no references be deleted', () => {
    expect(productInUseReason(FREE)).toBeNull()
  })

  it('refuses a product that still has stock in a warehouse', () => {
    expect(productInUseReason({ ...FREE, warehouseStock: 3 })).toBe('warehouse_stock')
  })

  it('refuses a product that is still on an aircraft', () => {
    expect(productInUseReason({ ...FREE, aircraftStock: 1 })).toBe('aircraft_stock')
  })

  it('refuses a product on an open customer order', () => {
    expect(productInUseReason({ ...FREE, openCustomerOrder: 2 })).toBe('customer_order')
  })

  it('refuses a product on a catering order that is not closed', () => {
    expect(productInUseReason({ ...FREE, openCateringOrder: 1 })).toBe('catering_order')
  })

  it('names the stock first when several things refer to the product', () => {
    const counts = { ...FREE, warehouseStock: 1, openCustomerOrder: 1, openCateringOrder: 1 }
    expect(productInUseReason(counts)).toBe('warehouse_stock')
  })
})

describe('productInUseMessage', () => {
  it('has a message for every reason', () => {
    const reasons = ['warehouse_stock', 'aircraft_stock', 'customer_order', 'catering_order'] as const
    for (const reason of reasons) {
      expect(productInUseMessage(reason)).toContain('Product')
    }
  })
})
