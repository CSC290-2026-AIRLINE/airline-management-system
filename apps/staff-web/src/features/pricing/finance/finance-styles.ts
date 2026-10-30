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
export const totalRowClass =
  'flex items-center justify-between rounded-(--pr-radius-lg) bg-(--pr-head) px-4 py-2.5 text-(length:--pr-text-body) font-semibold text-(--pr-ink)'
