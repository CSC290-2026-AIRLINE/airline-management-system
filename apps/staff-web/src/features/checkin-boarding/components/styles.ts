/** The F6 design's page, panel and control styles, shared by the staff pages. */
export const PANEL = 'rounded-2xl border-border p-6 gap-4'
export const PANEL_TITLE = 'm-0 font-sans text-[22px] font-semibold leading-[1.2] text-foreground'
export const MUTED = 'text-sm text-muted-foreground'
export const PRIMARY_BUTTON =
  'h-[39px] rounded-[6px] bg-primary px-[18px] text-sm font-semibold text-white hover:bg-[#0c1d38] hover:text-white'
export const SECONDARY_BUTTON =
  'h-[41px] rounded-[6px] border-border bg-white px-[18px] text-sm font-semibold text-foreground hover:bg-muted hover:text-foreground'
/** A white box with a visible border, so an empty field does not read as disabled. */
export const TEXT_INPUT =
  'h-[42px] w-[460px] max-w-full rounded-[8px] border border-[#cbd5e1] bg-white px-3 text-sm text-foreground placeholder:text-[#9aa3b2] hover:border-[#9aa6b8] focus-visible:border-[#1f408c] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1f408c]/20 disabled:bg-[#f7f9fc] disabled:text-muted-foreground'
export const INPUT_LABEL = 'text-sm font-medium leading-[1.5] text-foreground'
export const GATE_ACTIVE =
  'h-[39px] rounded-[10px] border-primary bg-[#eaf0fb] px-4 text-sm font-medium text-[#1f408c] hover:bg-[#eaf0fb] hover:text-[#1f408c]'
export const GATE_IDLE =
  'h-[39px] rounded-[10px] border-[#cbd5e1] bg-white px-4 text-sm font-medium text-foreground hover:border-[#9aa6b8] hover:bg-muted hover:text-foreground'
/** The filter chips above a table and the tabs of the issue list: the active one is the design's blue chip. */
export const CHIP_ACTIVE = 'border-primary bg-[#eaf0fb] text-[#1f408c] hover:bg-[#eaf0fb] hover:text-[#1f408c]'
export const CHIP_IDLE = 'border-[#cbd5e1] bg-white text-foreground hover:border-[#9aa6b8] hover:bg-muted hover:text-foreground'
/** A row action: the design's small white button with a border. */
export const ROW_BUTTON =
  'h-[34px] rounded-[6px] border-border bg-white px-3 text-sm font-semibold text-foreground hover:bg-muted hover:text-foreground'
