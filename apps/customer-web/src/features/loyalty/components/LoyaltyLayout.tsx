import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { LoadState } from '../use-load'
import { cx, GUTTER, PAGE, ui } from './labels'

const tab =
  'whitespace-nowrap rounded-[2px] border-b-[3px] border-transparent px-2 pb-2 text-[15px] font-semibold text-muted no-underline ' +
  'hover:text-navy focus-visible:outline-2 focus-visible:outline-teal sm:text-lg pointer-coarse:pt-2 ' +
  'data-[status=active]:border-[#455266] data-[status=active]:text-navy'

// Header band with the membership tabs (Overview, Statement, Benefits, Redemptions), then the page body.
export function LoyaltyLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className={PAGE} data-full-bleed>
      <header className={cx('flex flex-col gap-5 bg-band pt-6 sm:pt-10', GUTTER)}>
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted sm:text-base">{subtitle}</p>
        </div>
        <nav className="-mx-4 flex gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:gap-7 sm:px-0" aria-label="Membership">
          <Link to="/loyalty" activeOptions={{ exact: true }} className={tab}>
            Overview
          </Link>
          <Link to="/loyalty/statement" className={tab}>
            Statement
          </Link>
          <Link to="/loyalty/benefits" className={tab}>
            Benefits
          </Link>
          <Link to="/loyalty/redemptions" className={tab}>
            Redemptions
          </Link>
        </nav>
      </header>
      <div className={cx('flex flex-col gap-6 pt-5 pb-12 sm:gap-8 sm:pt-8 sm:pb-20', GUTTER)}>{children}</div>
    </main>
  )
}

// Renders the loading and error states of a request, and the page once it is ready.
export function Loaded<T>({ state, retry, children }: { state: LoadState<T>; retry: () => void; children: (data: T) => ReactNode }) {
  switch (state.status) {
    case 'loading':
      return (
        <p aria-live="polite" className="text-muted">
          Loading…
        </p>
      )
    case 'error':
      return (
        <div className="flex flex-col items-start gap-3 rounded-md border border-danger bg-white px-4 py-3 text-danger" role="alert">
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
