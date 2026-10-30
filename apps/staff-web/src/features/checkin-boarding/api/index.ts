// The staff feature's API entry point: the real backend or the browser mock.
export const F6_MOCK = import.meta.env.VITE_F6_MOCK === 'true'
export * from './types.ts'
export { ApiRequestError, createHttpStaffApi, type BagInput, type StaffApi, type StaffSearchQuery } from './client.ts'
export { createMockStaffApi } from '../mock/mock-staff-api.ts'
