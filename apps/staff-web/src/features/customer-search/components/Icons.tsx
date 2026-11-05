/**
 * Inline SVG icons. Lucide is not installed in this app (see apps/staff-web/CLAUDE.md),
 * so the handful of glyphs the Customer Search frames use are inlined here.
 * All of them inherit `currentColor` and are sized in `em` so they follow the text.
 */

interface IconProps {
  className?: string
}

function base(className: string | undefined, extra?: string) {
  return `cs-icon ${className ?? ''} ${extra ?? ''}`.trim()
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.6 10.6 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 8h9.5M9 4.5 12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M11.2 2.6a1.3 1.3 0 0 1 1.8 1.8l-7 7-2.4.6.6-2.4 7-7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg className={base(className)} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
