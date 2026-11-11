// Button sizes and colours shared by the tax and baggage cards.
const ACTION_BUTTON = 'h-[42px] px-6 text-[13px] font-semibold max-[800px]:h-11'

export const PRIMARY_BUTTON = `bg-(--pr-primary) hover:bg-(--pr-primary-hover) ${ACTION_BUTTON}`
export const OUTLINE_BUTTON = `border-(--pr-primary) bg-(--pr-surface) text-(--pr-primary) hover:bg-(--pr-tint) ${ACTION_BUTTON}`
export const DANGER_BUTTON = `mr-auto text-(--pr-danger) hover:bg-(--pr-danger-bg) hover:text-(--pr-danger) ${ACTION_BUTTON}`

export { CARD_BODY, CARD_TITLE, PHONE_SWITCH, SWITCH, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW, TABLE_WRAP } from '../components/card-styles'
