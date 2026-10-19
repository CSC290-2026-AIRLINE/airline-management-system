// Barrel for the F12 staff-web api layer. Real pages import the
// `useOnboardApi` hook and the typed errors from here.

export * from './types'
export { ApiError, NetworkError } from './client'
export {
  ProductApiError,
  ImageInvalidError,
  ProductInUseError,
  StockApiError,
  CateringApiError,
  OfferingsApiError,
  SettingInvalidError,
  MealPolicyInvalidError,
  FlightReportApiError,
  asApiError,
} from './errors'
export { useOnboardApi, type OnboardApi } from './useOnboardApi'
