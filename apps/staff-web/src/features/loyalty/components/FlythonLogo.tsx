import { cx } from './ui'

// The Flython Airlines mark from the F11 Figma file: an amber-and-white swoosh with a serif wordmark.
// "light" sits on the navy sidebar, "dark" on the white phone header.
export function FlythonLogo({ tone }: { tone: 'light' | 'dark' }) {
  const ink = tone === 'light' ? 'text-white' : 'text-navy'
  return (
    <span className={cx('inline-flex items-center gap-2.5', ink)} aria-label="Flython Airlines" role="img">
      <svg viewBox="0 0 64 36" className="h-8 w-14 flex-none" aria-hidden="true">
        <path d="M2 30C14 14 34 6 62 4 44 10 30 16 20 26Z" fill="#f5a524" />
        <path d="M8 34C20 22 36 15 56 12 42 18 30 24 22 34Z" fill={tone === 'light' ? '#ffffff' : '#9fb2d3'} />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[26px] font-bold tracking-[0.01em]">Flython</span>
        <span className="mt-0.5 self-center font-serif text-[8px] font-semibold tracking-[0.3em]">AIRLINES</span>
      </span>
    </span>
  )
}
