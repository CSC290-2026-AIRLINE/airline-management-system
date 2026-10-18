// Simulated "today" used by the staff UI. Per the spec, F12 never reads the real
// system clock; it always uses F1's simulation clock. The mock layer exposes it
// here so the page renders a stable date (Thu 8 Oct 2026) regardless of when it
// is opened, matching the screenshots.

const SIMULATED_TODAY = new Date('2026-10-08T09:00:00Z')

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export function getSimulatedToday(): Date {
  return new Date(SIMULATED_TODAY.getTime())
}

export function formatSimulatedToday(): string {
  const d = getSimulatedToday()
  const weekday = WEEKDAYS[d.getUTCDay()]
  const day = d.getUTCDate()
  const month = MONTHS[d.getUTCMonth()]
  const year = d.getUTCFullYear()
  return `${weekday} ${day} ${month} ${year}`
}
