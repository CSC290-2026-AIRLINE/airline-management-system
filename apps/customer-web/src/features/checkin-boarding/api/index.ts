/** Build-time switch: the Vercel demo runs on the browser mock, the PR runs on the real API. */
export const F6_MOCK = import.meta.env?.VITE_F6_MOCK === 'true'

export { ApiRequestError, createHttpApi } from './client.ts'
export type { CheckInApi } from './client.ts'
export { createMockApi } from '../mock/mock-api.ts'
