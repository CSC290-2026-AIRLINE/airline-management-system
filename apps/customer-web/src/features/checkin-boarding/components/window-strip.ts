import { DEFAULT_WINDOW_SETTINGS } from '../domain/window.ts'
import { formatDateTime } from '../format.ts'

/** The text follows the setting, so it cannot drift from the window it describes. */
const CLOSES_TEXT =
  DEFAULT_WINDOW_SETTINGS.checkInClosesMinutes === 60 ? '1 hour' : `${DEFAULT_WINDOW_SETTINGS.checkInClosesMinutes} minutes`

/** The window strip: the open flag comes from the server, the clock only picks the closed wording. */
export function windowStrip(window: { opensAt: string; closesAt: string; isOpen: boolean }, now: Date): { open: boolean; text: string } {
  if (window.isOpen) return { open: true, text: `Closes ${CLOSES_TEXT} before departure, ${formatDateTime(window.closesAt)}.` }
  if (now.getTime() < new Date(window.opensAt).getTime()) return { open: false, text: `Opens ${formatDateTime(window.opensAt)}.` }
  return { open: false, text: `Check-in closed ${formatDateTime(window.closesAt)}.` }
}
