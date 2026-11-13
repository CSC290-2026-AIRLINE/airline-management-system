/** Open/closed state of the staff sidebar and its groups, kept in localStorage so it survives reloads and route changes. */
const PREFIX = 'flython.staff.nav.'

/** Storage can be missing or throw (private window, blocked site data), so every access falls back to `fallback`. */
export function readOpen(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(PREFIX + key)
    return value === 'open' ? true : value === 'closed' ? false : fallback
  } catch {
    return fallback
  }
}

export function writeOpen(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(PREFIX + key, open ? 'open' : 'closed')
  } catch {
    // Not persisted; the UI still works for this visit.
  }
}

export const SIDEBAR_KEY = 'sidebar'
export const groupKey = (label: string) => `group.${label}`
