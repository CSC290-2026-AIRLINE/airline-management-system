// Tailwind class strings shared by the Feature 11 staff pages, following the F11 Figma screens. Mobile first: the
// sm/md/lg variants add the tablet and desktop layout. Kept out of the .tsx files so fast refresh works.

export const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]'

const buttonBase = cx(
  'inline-flex min-h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold',
  'disabled:cursor-progress disabled:opacity-60 pointer-coarse:min-h-11',
  focus,
)

export const ui = {
  // Page shell: the sidebar is a top bar on phones and small tablets, a column from md up.
  shell: cx(
    'grid min-h-svh grid-cols-1 grid-rows-[auto_1fr] bg-canvas text-left font-sans text-sm leading-[1.4] tracking-normal text-ink',
    'flex-1 [color-scheme:light] md:grid-cols-[clamp(200px,18vw,240px)_minmax(0,1fr)] md:grid-rows-1',
    // Preflight is off app-wide, so border-box sizing is set here: padding stays inside each element's width.
    'box-border [&_*]:box-border',
    '[&_:is(h1,h2,h3)]:m-0 [&_:is(h1,h2,h3)]:font-sans [&_:is(h1,h2,h3)]:tracking-normal [&_:is(h1,h2,h3)]:text-inherit',
  ),
  main: 'flex w-full max-w-[1280px] min-w-0 flex-col gap-4 px-4 pt-5 pb-10 sm:px-6 lg:px-11 lg:pt-8 lg:pb-16',
  topRow: 'flex flex-wrap items-center justify-end gap-3',
  meta: 'w-full text-xs text-muted sm:w-auto sm:text-[13px]',
  title: 'text-2xl leading-tight font-extrabold sm:text-3xl lg:text-[34px]',
  purpose: '-mt-2 text-sm text-muted sm:text-base',
  info: 'rounded-lg bg-[#e8eef7] px-3.5 py-2.5 text-xs text-link',
  error: 'flex flex-col items-start gap-3 rounded-md border border-danger bg-white px-4 py-3 text-danger',

  card: 'flex min-w-0 flex-col gap-3 rounded-[10px] border border-field bg-white px-3.5 py-3.5 sm:px-[18px] sm:py-5',
  cardTitle: 'text-base font-bold',
  cardHead: 'flex flex-wrap items-center justify-between gap-3',
  grid: 'grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]',
  gridEven: 'grid grid-cols-1 items-start gap-3.5 md:grid-cols-2',

  muted: 'text-muted',
  small: 'text-[11px] leading-normal text-muted',
  strong: 'font-bold',
  num: 'text-right! tabular-nums whitespace-nowrap',
  plus: 'text-ok',
  minus: 'text-warn',
  warn: 'text-[11px] text-warn',
  fieldError: 'text-xs text-danger',
  srOnly: 'sr-only',

  tableWrap: '-mx-3.5 overflow-x-auto px-3.5 sm:mx-0 sm:px-0',
  table: cx(
    'w-full min-w-[560px] border-collapse text-xs md:min-w-0',
    '[&_th]:border-b [&_th]:border-divider [&_th]:pr-2.5 [&_th]:pb-2 [&_th]:text-left [&_th]:text-[10px] [&_th]:font-semibold',
    '[&_th]:uppercase [&_th]:tracking-[0.04em] [&_th]:text-muted',
    '[&_td]:border-b [&_td]:border-divider [&_td]:py-2.5 [&_td]:pr-2.5 [&_td]:align-middle',
    '[&_tbody_th]:py-2.5 [&_tbody_th]:text-xs [&_tbody_th]:font-bold [&_tbody_th]:normal-case [&_tbody_th]:tracking-normal [&_tbody_th]:text-ink',
    '[&_:is(th,td):last-child]:pr-0',
  ),
  tableTall: '[&_td]:py-3.5',
  cellSub: 'text-[11px] text-muted',
  empty: 'flex flex-col gap-1 py-6 text-center',

  button: cx(buttonBase, 'border border-field bg-white text-ink hover:bg-soft'),
  buttonPrimary: cx(buttonBase, 'border border-sidebar bg-sidebar text-white hover:bg-[#1c2e50]'),
  label: 'text-xs font-semibold text-muted',
  field: 'flex min-w-0 flex-col gap-1.5',
  input: cx(
    'box-border w-full rounded-md border border-[#c8d3df] bg-white px-3 py-2 text-[15px] text-ink pointer-coarse:min-h-11',
    'aria-invalid:border-danger',
    focus,
  ),
  inputError: 'border-danger',
  inputSmall: 'px-2.5 py-[7px] text-[13px]',

  // The base pill has no colour; add exactly one colour class below.
  pill: 'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold',
  pillGrey: 'bg-[#eef0f3] text-[#5c6678]',
  pillBlue: 'bg-[#e8eef7] text-link',
  pillGreen: 'bg-[#e0faeb] text-ok',
  pillAmber: 'bg-[#fff3db] text-warn',
  pillRed: 'bg-[#fde8e8] text-danger',
  pillSilver: 'bg-[#e5e8ee] text-[#3b4558]',
  pillGold: 'bg-[#fdf0c4] text-[#6b4e00]',
  pillPlatinum: 'bg-[#e7e3fb] text-[#3b2f86]',
  pillDark: 'bg-[#1d2a40] text-white',

  segmented: cx(
    'flex gap-1 self-stretch overflow-x-auto rounded-lg bg-soft p-1 sm:inline-flex sm:self-start',
    '[&_button]:flex-[1_0_auto] [&_button]:cursor-pointer [&_button]:rounded-md [&_button]:border [&_button]:border-transparent',
    '[&_button]:bg-transparent [&_button]:px-3.5 [&_button]:py-[7px] [&_button]:text-[13px] [&_button]:font-semibold [&_button]:text-muted',
    'sm:[&_button]:flex-none pointer-coarse:[&_button]:min-h-10',
    '[&_button[aria-pressed=true]]:border-field [&_button[aria-pressed=true]]:bg-white [&_button[aria-pressed=true]]:text-ink',
    '[&_button:disabled]:cursor-not-allowed [&_button:disabled]:text-[#b7bfcc]',
  ),
  stat: 'flex min-w-0 flex-col gap-0.5 rounded-md bg-soft px-3 py-2.5 [&>span]:text-[9px] [&>span]:font-semibold [&>span]:uppercase [&>span]:tracking-[0.06em] [&>span]:text-muted [&>strong]:text-[13px]',
  stats: 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3',

  memberList: cx(
    'm-0 flex list-none flex-col gap-2 p-0',
    '[&_button]:flex [&_button]:w-full [&_button]:cursor-pointer [&_button]:flex-col [&_button]:gap-0.5 [&_button]:rounded-lg',
    '[&_button]:border [&_button]:border-field [&_button]:bg-white [&_button]:px-3 [&_button]:py-2.5 [&_button]:text-left [&_button]:text-ink',
    'pointer-coarse:[&_button]:px-3.5 pointer-coarse:[&_button]:py-3',
    '[&_button[aria-current=true]]:border-[#9fb2d3] [&_button[aria-current=true]]:bg-[#e8eef7]',
    '[&_strong]:flex [&_strong]:justify-between [&_strong]:gap-2 [&_strong]:text-[13px] [&_strong]:font-semibold',
  ),
  avatar: 'grid size-9 flex-none place-items-center rounded-full bg-sidebar text-[13px] font-bold text-white',
  searchRow: 'flex flex-wrap gap-2 [&>*]:flex-[1_1_160px] sm:flex-nowrap sm:[&>button]:flex-none',

  // Pop-ups: a bottom sheet with full-width buttons on phones, a centred dialog from sm up.
  backdrop: 'fixed inset-0 z-10 grid items-end justify-items-center bg-black/60 p-2 sm:place-items-center sm:p-4',
  modal: cx(
    'box-border flex max-h-[calc(100svh-16px)] w-full max-w-[560px] flex-col gap-3.5 overflow-y-auto rounded-[14px] bg-white p-[18px]',
    'sm:max-h-[calc(100svh-32px)] sm:p-[26px] [&_h2]:text-xl [&_h2]:font-extrabold',
  ),
  modalActions: 'flex flex-col-reverse gap-3 [&>*]:w-full sm:flex-row sm:justify-end sm:[&>*]:w-auto',
  toggleRow: 'flex flex-wrap items-center justify-between gap-2 text-sm font-semibold',
  toast: cx(
    'fixed inset-x-3 top-[18px] z-20 rounded-lg bg-[#0f6b3a] px-[18px] py-2.5 text-center text-[13px] font-semibold text-white',
    'shadow-[0_8px_20px_rgba(0,0,0,0.2)] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2',
  ),

  result: 'flex flex-col gap-1 rounded-lg px-3.5 py-3 [&_strong]:text-base',
  resultOk: 'bg-[#e0faeb] text-ok',
  resultNo: 'bg-[#fde8e8] text-danger',
  resultIdle: 'bg-soft text-muted',
}
