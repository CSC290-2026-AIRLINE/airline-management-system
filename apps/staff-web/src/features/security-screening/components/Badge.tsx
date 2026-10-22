import type { ReactNode } from 'react'

export function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`sq-badge sq-tone-${tone.toLowerCase()}`}>{children}</span>
}
