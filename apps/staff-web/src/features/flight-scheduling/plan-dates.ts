const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DAYS = 3660 // about ten years; enough for any validity period

// The calendar dates (YYYY-MM-DD) a pattern would fly: every date from..to whose ISO weekday (1 = Monday ... 7 = Sunday) is in `days`.
// Same rule as the backend's schedule builder, so the "would preview" line matches the real preview.
export function planDates(from: string, to: string, days: number[]) {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []
  const dates: string[] = []
  for (let t = start, n = 0; t <= end && n < MAX_DAYS; t += DAY_MS, n++) {
    const weekday = ((new Date(t).getUTCDay() + 6) % 7) + 1
    if (days.includes(weekday)) dates.push(new Date(t).toISOString().slice(0, 10))
  }
  return dates
}
