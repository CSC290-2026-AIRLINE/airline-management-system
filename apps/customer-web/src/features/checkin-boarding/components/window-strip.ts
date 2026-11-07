import { DEFAULT_WINDOW_SETTINGS, computeWindow, isWindowOpen } from '../domain/window.ts'
import { formatDateTime } from '../format.ts'

/** The window strip: when check-in opens and closes for the flight the passenger booked. */
export function windowStrip(depAt: string, now: Date): { open: boolean; text: string } {
  const window = computeWindow(new Date(depAt), DEFAULT_WINDOW_SETTINGS)
  const closes = formatDateTime(window.closesAt.toISOString())

  if (isWindowOpen(now, window)) {
    return { open: true, text: `Closes 1 hour before departure, ${closes}.` }
  }
  if (now.getTime() >= window.closesAt.getTime()) {
    return { open: false, text: `Check-in closed ${closes}.` }
  }
  return { open: false, text: `Opens ${formatDateTime(window.opensAt.toISOString())}.` }
}
