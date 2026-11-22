// Shared by every card on the pricing pages, so titles, spacing, tables and switches match.
export const CARD_TITLE = 'text-lg font-semibold text-foreground'
export const CARD_BODY = 'flex flex-col gap-4'
export const TABLE_WRAP = 'overflow-hidden rounded-lg border [&_td:first-child]:pl-4 [&_th:first-child]:pl-4'
export const TABLE_HEAD_ROW = 'bg-(--pr-head) hover:bg-(--pr-head)'
export const TABLE_HEAD = 'h-10 px-3 text-[11px] font-semibold text-(--pr-primary) uppercase'
export const TABLE_ROW = 'h-[52px] border-(--pr-divider) hover:bg-transparent'

// shadcn's switch resized to the design: 36×20 on desktop, 42×24 on phones. The thumb is its only child.
export const SWITCH =
  'data-[state=checked]:bg-(--pr-good) data-[state=unchecked]:bg-(--pr-border) data-[size=default]:h-5 data-[size=default]:w-9 [&>span]:data-[state=checked]:translate-x-[18px]!'
export const PHONE_SWITCH =
  'data-[state=checked]:bg-(--pr-good) data-[state=unchecked]:bg-(--pr-border) data-[size=default]:h-6 data-[size=default]:w-[42px] [&>span]:size-5! [&>span]:data-[state=checked]:translate-x-5!'
