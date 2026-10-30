import type { TierCode, TransactionType } from '../api/types'

// Constants and Tailwind class strings shared by the Feature 11 customer pages (kept out of the .tsx files so fast
// refresh works).

// Flight search and My Trips belong to Feature 3; point these at their routes once those pages exist.
export const FLIGHT_SEARCH_PATH = '/'
export const MY_TRIPS_PATH = '/'

export const TYPE_LABEL: Record<TransactionType, string> = {
  earn: 'Earned',
  redeem: 'Spent',
  redeem_reversal: 'Returned',
  expire: 'Expired',
  adjust: 'Adjusted',
}

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

const buttonBase =
  'inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-[18px] py-2.5 text-sm font-semibold no-underline ' +
  'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal pointer-coarse:min-h-11 ' +
  'disabled:cursor-not-allowed'

// Page wrapper shared by every Feature 11 customer page: the F11 palette and type, light in dark mode as designed, and
// headings reset against the app-wide h1/h2 styles.
export const PAGE = cx(
  'flex-1 bg-white text-left font-sans text-sm leading-[1.4] tracking-normal text-ink [color-scheme:light]',
  // Preflight is off app-wide, so border-box sizing is set here: padding stays inside each element's width.
  'box-border [&_*]:box-border',
  '[&_:is(h1,h2,h3)]:m-0 [&_:is(h1,h2,h3)]:font-sans [&_:is(h1,h2,h3)]:tracking-normal [&_:is(h1,h2,h3)]:text-inherit',
)

// Side padding for full-width bands: grows with the screen.
export const GUTTER = 'px-4 sm:px-6 lg:px-[max(3rem,calc((100%-1280px)/2))]'

export const ui = {
  button: cx(buttonBase, 'border border-field bg-white text-ink hover:bg-soft'),
  buttonPrimary: cx(
    buttonBase,
    'border border-navy bg-navy text-white disabled:border-[#cbd2dc] disabled:bg-[#e3e7ee] disabled:text-[#8a94a6]',
  ),
  buttonGhost: cx(buttonBase, 'border border-white/40 bg-white/10 text-white hover:bg-white/20'),
  link: 'text-[13px] font-semibold text-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-teal',
  caps: 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted',
  small: 'text-xs leading-normal text-muted',
  sectionTitle: 'm-0 text-lg font-extrabold text-ink sm:text-xl',
  section: 'flex flex-col gap-3.5 border-t border-line pt-7',
  pill: 'inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold',
  tableWrap: '-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0',
  table: 'w-full min-w-[560px] border-collapse',
  th: 'border-b border-divider pb-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted last:pr-0',
  td: 'border-b border-divider py-3 pr-3 align-middle last:pr-0',
  num: 'text-right tabular-nums whitespace-nowrap',
  empty: 'flex flex-col gap-1 py-8 text-center',
  iconBox: 'grid size-10 flex-none place-items-center rounded-md',
}

export const TYPE_PILL: Record<TransactionType, string> = {
  earn: 'bg-[#e8eef7] text-link',
  redeem: 'bg-[#fff3db] text-warn',
  redeem_reversal: 'bg-[#e0faeb] text-ok',
  expire: 'bg-[#eef0f3] text-[#5c6678]',
  adjust: 'bg-[#eef0f3] text-[#5c6678]',
}

export const TIER_PILL: Record<TierCode, string> = {
  silver: 'bg-[#dbe0e8] text-[#293345]',
  gold: 'bg-[#fbefc8] text-[#6b4e00]',
  platinum: 'bg-[#e7e3fb] text-[#3b2f86]',
}

export const TIER_ART: Record<TierCode, string> = {
  silver: 'bg-[linear-gradient(24deg,#dbe0e8_12%,#adb5c2_88%)] text-[#293345]',
  gold: 'bg-[linear-gradient(24deg,#f3d27a_12%,#c9962f_88%)] text-[#3d2c00]',
  platinum: 'bg-[linear-gradient(24deg,#4a3f8f_12%,#1d1b3a_88%)] text-white',
}

export const NO_TIER_ART = 'bg-[linear-gradient(24deg,#e8edf3_12%,#cfd7e2_88%)] text-ink'
