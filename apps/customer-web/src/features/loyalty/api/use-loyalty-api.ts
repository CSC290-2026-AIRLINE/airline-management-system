import { createMockLoyaltyApi } from './mock-loyalty-api'

// One mock for the whole session, so joining on one page shows on the next; set member: false to see the Join page.
// Replace with an HTTP client built on fetchWithAuth once the backend module is merged; pages only see LoyaltyApi.
const mockApi = createMockLoyaltyApi({ member: true })

export function useLoyaltyApi() {
  return mockApi
}
