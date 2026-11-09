// Combined hook: returns all five F12 API surfaces in one object so
// the pages only need a single `useAppAuth` import.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, type ApiFetch } from './client'
import { createFlightReportApi, type FlightReportApi } from './flight-report'
import { createOfferingsApi, type OfferingsApi } from './offerings'
import { createOrdersApi, type OrdersApi } from './orders'
import { createProductsApi, type ProductsApi } from './products'
import { createStockApi, type StockApi } from './stock'

export interface OnboardApi {
  products: ProductsApi
  stock: StockApi
  orders: OrdersApi
  offerings: OfferingsApi
  flightReport: FlightReportApi
}

export function useOnboardApi(): OnboardApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => {
    const client = new ApiClient(fetchWithAuth as ApiFetch)
    return {
      products: createProductsApi(client),
      stock: createStockApi(client),
      orders: createOrdersApi(client),
      offerings: createOfferingsApi(client),
      flightReport: createFlightReportApi(client),
    }
  }, [fetchWithAuth])
}
