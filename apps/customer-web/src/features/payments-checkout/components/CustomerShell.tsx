import type { ReactNode } from 'react'
import { Page, type PageWidth } from '@customer-web/components/Page'

interface CustomerShellProps {
  title: string
  /** A line under the title. */
  description?: string
  /** Underline tabs between the pages of this area (receipts, refunds, vouchers). */
  tabs?: ReactNode
  /** A link or button on the right of the page title: the "export" button, for example. */
  action?: ReactNode
  /** The three pages of this area are tabs of each other, so they share the wide column. */
  width?: PageWidth
  children: ReactNode
}

/** The frame every customer page in this feature sits in, under the app's own site header, on the shared page shell. */
export function CustomerShell({ title, description, tabs, action, width = 'wide', children }: CustomerShellProps) {
  return (
    <Page width={width} title={title} description={description} tabs={tabs} actions={action}>
      {children}
    </Page>
  )
}
