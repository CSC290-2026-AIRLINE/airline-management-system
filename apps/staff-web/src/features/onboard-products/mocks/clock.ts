// Internal mock clock for expiry logic. The current "now" is a constant so the
// Stock page can compute shelf-life-based expiry dates deterministically.
// This must NOT be displayed to the user -- the prototype footer "Simulated
// today" badge is intentionally not part of the staff-web build.

export const MOCK_NOW_ISO = '2026-10-08T09:00:00Z'

export function now(): Date {
  return new Date(MOCK_NOW_ISO)
}

// Add a number of days to the mock now. Returns an ISO string so the caller
// can store it directly in a stock_batch.expires_at column.
export function addDays(days: number): string {
  const d = now()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}
