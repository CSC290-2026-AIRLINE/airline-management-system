import { createMockStaffLoyaltyApi } from './mock-staff-loyalty-api'

// One mock for the whole session. Replace with an HTTP client built on fetchWithAuth once the backend module is merged;
// the pages only see the StaffLoyaltyApi interface.
const mockApi = createMockStaffLoyaltyApi()

export function useStaffLoyaltyApi() {
  return mockApi
}
