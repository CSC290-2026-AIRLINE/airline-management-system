// Copy of apps/backend/src/modules/checkin-boarding/domain/window.ts — keep in sync
export interface WindowSettings {
  checkInOpensHours: number
  checkInClosesMinutes: number
  boardingStartsMinutes: number
}

export const DEFAULT_WINDOW_SETTINGS: WindowSettings = {
  checkInOpensHours: 24,
  checkInClosesMinutes: 60,
  boardingStartsMinutes: 40,
}

export interface Window {
  opensAt: Date
  closesAt: Date
  boardingAt: Date
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Derived from the current departure every time, so an F2 delay moves the window with no stored state. */
export function computeWindow(depAt: Date, settings: WindowSettings): Window {
  return {
    opensAt: new Date(depAt.getTime() - settings.checkInOpensHours * HOUR),
    closesAt: new Date(depAt.getTime() - settings.checkInClosesMinutes * MINUTE),
    boardingAt: new Date(depAt.getTime() - settings.boardingStartsMinutes * MINUTE),
  }
}

/** Opens at the first instant of the window, closes at the first instant outside it. */
export function isWindowOpen(now: Date, window: { opensAt: Date; closesAt: Date }): boolean {
  return window.opensAt.getTime() <= now.getTime() && now.getTime() < window.closesAt.getTime()
}
