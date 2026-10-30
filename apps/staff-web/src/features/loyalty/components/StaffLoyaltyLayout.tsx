import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { formatNow } from '../format'
import type { LoadState } from '../use-load'
import { cx, ui } from './ui'

const navLink = cx(
  'whitespace-nowrap rounded-md px-3 py-2 text-sm text-white no-underline hover:bg-white/5 pointer-coarse:px-3.5 pointer-coarse:py-[11px]',
  'focus-visible:outline-2 focus-visible:outline-[#f5a524] data-[status=active]:bg-sidebar-active',
)

// The F11 staff shell: the loyalty sidebar (a top bar with a scrolling link row below md), the page title and purpose,
// and the info banner.
export function StaffLoyaltyLayout({
  title,
  purpose,
  info,
  children,
}: {
  title: string
  purpose: string
  info: string
  children: ReactNode
}) {
  const { user } = useUser()
  const { logout, isLoading } = useAppAuth()
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Staff'

  return (
    <div className={ui.shell} data-full-bleed>
      <aside className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 bg-sidebar px-4 pt-3.5 pb-2.5 text-white md:flex md:flex-col md:items-stretch md:gap-2 md:px-[18px] md:py-7">
        <span className="px-1.5 font-serif text-2xl font-bold tracking-[0.02em]">AIRLINES</span>
        <span className="mx-1.5 mt-2.5 mb-1.5 hidden h-[3px] w-11 bg-[#f5a524] md:block" />
        <span className="px-1.5 text-[11px] uppercase tracking-[0.1em] text-white/70">Staff · Loyalty</span>
        <nav
          className="col-span-full -mx-4 mt-1.5 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:mt-6 md:flex-col md:overflow-visible md:p-0"
          aria-label="Loyalty programme"
        >
          <span className="mb-2 hidden px-1.5 text-[11px] uppercase tracking-[0.1em] text-white/70 md:block">Loyalty programme</span>
          <Link to="/loyalty/members" className={navLink}>
            Member Lookup
          </Link>
          <Link to="/loyalty/rules" className={navLink}>
            Loyalty Rules
          </Link>
          <Link to="/loyalty/award-release" className={navLink}>
            Award Release
          </Link>
          <Link to="/loyalty/lounge" className={navLink}>
            Lounge Desk
          </Link>
        </nav>
        <div className="col-span-full mt-1 flex items-center justify-between gap-3 border-t border-white/10 pt-2 md:mt-auto md:flex-col md:items-start md:gap-1.5 md:border-0 md:px-1.5 md:pt-0">
          <strong className="min-w-0 truncate text-sm font-semibold md:text-xl md:whitespace-normal">{name}</strong>
          <span className="hidden text-xs text-white/75 md:block">Navigation follows assigned staff permissions.</span>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-sm text-white focus-visible:outline-2 focus-visible:outline-[#f5a524] md:mt-1.5"
            onClick={() => void logout()}
            disabled={isLoading}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className={ui.main}>
        <div className={ui.topRow}>
          <span className={ui.meta}>
            {formatNow(new Date())} · {name}
          </span>
        </div>
        <h1 className={ui.title}>{title}</h1>
        <p className={ui.purpose}>{purpose}</p>
        <p className={ui.info}>{info}</p>
        {children}
      </main>
    </div>
  )
}

export function Loaded<T>({ state, retry, children }: { state: LoadState<T>; retry: () => void; children: (data: T) => ReactNode }) {
  switch (state.status) {
    case 'loading':
      return (
        <p aria-live="polite" className={ui.muted}>
          Loading…
        </p>
      )
    case 'error':
      return (
        <div className={ui.error} role="alert">
          <p>{state.message}</p>
          <button type="button" className={ui.button} onClick={retry}>
            Try again
          </button>
        </div>
      )
    case 'ready':
      return <>{children(state.data)}</>
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}
