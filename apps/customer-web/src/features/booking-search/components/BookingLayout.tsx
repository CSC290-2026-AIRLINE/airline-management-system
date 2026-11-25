import type { ReactNode } from 'react'
import { PageCanvas } from '@customer-web/components/Page'

/** The canvas under the shared header for the booking pages. Each page builds its own content with PageShell or Page. */
export function BookingLayout({ children }: { children: ReactNode }) {
  return <PageCanvas>{children}</PageCanvas>
}
