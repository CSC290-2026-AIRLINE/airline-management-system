import type { BookingStatus, TierCode, TransactionType } from '../api/types'

// Constants and Tailwind class strings shared by the Feature 11 customer pages (kept out of the .tsx files so fast
// refresh works).

// Flight search and My Trips belong to Feature 3; point these at their routes once those pages exist.
export const FLIGHT_SEARCH_PATH = '/'
export const MY_TRIPS_PATH = '/'
// Feature 11's Flight search with miles: award seats per flight, before Feature 3b's booking path.
export const AWARD_SEARCH_PATH = '/loyalty/flights'

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link'

// Page wrapper shared by every Feature 11 customer page: the F11 palette and type, light in dark mode as designed, and
// headings reset against the app-wide h1/h2/p styles in index.css.
export const PAGE = cx(
  'flex min-h-svh flex-col bg-canvas text-left font-sans text-sm leading-[1.45] tracking-normal text-ink [color-scheme:light]',
  // Preflight is off app-wide, so border-box sizing is set here: padding stays inside each element's width.
  'box-border [&_*]:box-border',
  '[&_:is(h1,h2,h3,p)]:m-0 [&_:is(h1,h2,h3)]:font-sans [&_:is(h1,h2,h3)]:tracking-normal [&_:is(h1,h2,h3)]:text-inherit',
)

// Content column: 1220px wide on desktop, 16px side gutter on a phone.
export const CONTAINER = 'mx-auto w-full max-w-[1252px] px-4 sm:px-6 lg:px-8'

export const TYPE_LABEL: Record<TransactionType, string> = {
  earn: 'Earned',
  redeem: 'Spent',
  redeem_reversal: 'Returned',
  expire: 'Expired',
  adjust: 'Adjusted',
}

export const TYPE_PILL: Record<TransactionType, string> = {
  earn: 'bg-[#e8eef7] text-link',
  redeem: 'bg-[#fff3db] text-warn',
  redeem_reversal: 'bg-[#e0faeb] text-ok',
  expire: 'bg-[#eef0f3] text-[#5c6678]',
  adjust: 'bg-transparent text-[#5c6678]',
}

export const MILES_TONE: Record<TransactionType, string> = {
  earn: 'text-ok',
  redeem: 'text-warn',
  redeem_reversal: 'text-ok',
  expire: 'text-warn',
  adjust: 'text-ok',
}

export const BOOKING_LABEL: Record<BookingStatus, string> = {
  held: 'Held',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export const BOOKING_PILL: Record<BookingStatus, string> = {
  held: 'bg-[#fff3db] text-warn',
  confirmed: 'bg-[#e0faeb] text-ok',
  cancelled: 'bg-[#eef0f3] text-[#5c6678]',
  expired: 'bg-transparent text-[#5c6678]',
}

// Tier card art, from the Figma tier cards.
export const TIER_ART: Record<TierCode, string> = {
  silver: 'bg-[linear-gradient(135deg,#eef1f5_0%,#c3cad5_100%)] text-[#293345]',
  gold: 'bg-[linear-gradient(135deg,#f7dc8a_0%,#c9962f_100%)] text-[#3d2c00]',
  platinum: 'bg-[linear-gradient(135deg,#5b4bb0_0%,#1d1b3a_100%)] text-white',
}

export const NO_TIER_ART = 'bg-[linear-gradient(135deg,#e8edf3_0%,#cfd7e2_100%)] text-ink'

// The dashboard benefits card header.
export const TIER_BAND: Record<TierCode, string> = {
  silver: 'bg-[linear-gradient(90deg,#eef1f5,#b7bfcc)]',
  gold: 'bg-[linear-gradient(90deg,#f7dc8a,#c9962f)]',
  platinum: 'bg-[linear-gradient(90deg,#8b7be0,#2b2660)] text-white',
}
