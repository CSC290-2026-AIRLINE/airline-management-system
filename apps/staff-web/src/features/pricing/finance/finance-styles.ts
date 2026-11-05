// Tailwind classes shared by the finance cards. Colours come from the --pr-* tokens on PricingShell.
export const tableWrapClass = 'overflow-hidden rounded-(--pr-radius-lg) border border-(--pr-border) max-[800px]:hidden'
export const headRowClass = 'border-(--pr-border) hover:bg-transparent'
export const headClass = 'h-10 px-4 text-(length:--pr-text-caption) font-semibold tracking-wide text-(--pr-text) uppercase'
export const rowClass = 'border-(--pr-divider) hover:bg-transparent'
export const cellClass = 'px-4 py-3'
export const phoneListClass = 'grid gap-2.5 min-[800px]:hidden'
export const phoneItemClass = 'grid gap-1.5 rounded-(--pr-radius-card) border border-(--pr-divider) p-3.5'
export const primaryButtonClass = 'h-10 rounded-(--pr-radius-lg) bg-(--pr-primary) px-5 text-white hover:bg-(--pr-primary-hover)'
export const outlineButtonClass =
  'h-9 rounded-(--pr-radius) border-(--pr-primary) bg-white px-3 text-(--pr-ink) hover:bg-(--pr-tint) disabled:border-(--pr-border) disabled:bg-(--pr-tint) disabled:text-(--pr-muted) disabled:opacity-100'
// Values from the Figma (Modal / Record Expense). A dialog renders in a portal outside PricingShell, so the --pr-* tokens
// don't reach it; the colours are written out (navy #102544, label grey #677287, border #cbd5e1) so Tailwind sees them.
export const dialogContentClass =
  'gap-0 rounded-[14px] bg-white p-6 font-[Inter,system-ui,sans-serif] text-[#102544] shadow-[0_12px_20px_rgba(15,36,69,0.3)] ring-0 sm:max-w-[480px]'
// ! because index.css styles every h2 (grey in dark mode, 24px) outside Tailwind's layers, which beats classes.
export const dialogTitleClass =
  'm-0! font-[Inter,system-ui,sans-serif]! text-[20px]! leading-normal! font-bold! tracking-normal! text-[#102544]!'
export const dialogLabelClass = 'text-[11px] font-semibold text-[#677287] uppercase'
// md:text-[13px] too: shadcn's Input switches to text-sm from md up.
export const dialogFieldClass =
  'h-10 w-full rounded-[10px] data-[size=default]:h-10 border-[#cbd5e1] bg-white px-3.5 text-[13px] text-[#102544] md:text-[13px]'
export const dialogErrorClass = 'm-0 rounded-lg bg-[#fdecec] px-3 py-2 text-sm text-[#b42318]'
export const dialogFooterClass = 'mx-0 mb-0 gap-2.5 border-0 bg-transparent p-0'
export const dialogButtonClass = 'h-10 rounded-[8px] px-6 text-[13px] font-semibold'
export const dialogCancelClass = 'border-[#102544] bg-white text-[#102544] hover:bg-[#f0f2f7]'
export const dialogSubmitClass = 'bg-[#102544] text-white hover:bg-[#22365a]'
export const totalRowClass =
  'flex items-center justify-between rounded-(--pr-radius-lg) bg-(--pr-head) px-4 py-2.5 text-(length:--pr-text-body) font-semibold text-(--pr-ink)'
