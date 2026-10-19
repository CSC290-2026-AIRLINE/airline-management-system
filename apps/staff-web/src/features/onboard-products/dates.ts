// Tiny date helpers. addDays(0) returns today; addDays(2) returns
// today + 2 days. Returned as YYYY-MM-DD so the input type="date" can
// take the value as-is.

export function addDays(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString()
}

export function todayDate(): string {
  return addDays(0).slice(0, 10)
}
