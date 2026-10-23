import type { ReactNode } from 'react'

// A tinted message box; the tone picks the colours from the --fs-* tokens. `action` is a link or button set apart on the right.
export function Callout({ tone, children, action }: { tone: 'info' | 'warn' | 'crit' | 'good'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`fs-callout fs-callout-${tone}${action ? ' fs-callout-action' : ''}`}>
      {action ? (
        <>
          <span>{children}</span>
          {action}
        </>
      ) : (
        children
      )}
    </div>
  )
}
