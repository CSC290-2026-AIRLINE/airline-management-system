export const DEMO_FLIGHT_ID = '00000000-0000-0000-0000-f00000000012'
export const DEMO_CABIN = 'business'

export function demoEnabled(): boolean {
  return process.env.NODE_ENV === 'development' && process.env.F12_DEMO_ENABLED === 'true'
}
