import type { ReactNode } from 'react'
import type { LoadState } from '../use-load'
import { ui } from './ui'

// The F11 page frame inside the global staff sidebar (see routes/_authenticated/loyalty/route.tsx): title, purpose line
// and optional info note above the page content.
export function StaffLoyaltyLayout({
  title,
  purpose,
  info,
  children,
}: {
  title: string
  purpose: string
  info?: string
  children: ReactNode
}) {
  return (
    <div className={ui.shell}>
      <main className={ui.main}>
        <h1 className={ui.title}>{title}</h1>
        <p className={ui.purpose}>{purpose}</p>
        {info && <p className={ui.info}>{info}</p>}
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
