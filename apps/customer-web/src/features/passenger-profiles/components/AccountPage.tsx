import type { ReactNode } from 'react'
import { Page, PageCanvas, PageContent, type PageWidth } from '@customer-web/components/Page'

/**
 * Page frame shared by every account screen, on the shared page shell. With a `title` it gets the navy banner (Profile);
 * without one it is just the content column (the first sign-in card).
 */
export default function AccountPage({
  className,
  width = 'standard',
  title,
  description,
  children,
}: {
  className?: string
  width?: PageWidth
  title?: string
  description?: string
  children: ReactNode
}) {
  if (title !== undefined) {
    return (
      <Page width={width} title={title} description={description} className={className}>
        {children}
      </Page>
    )
  }
  return (
    <PageCanvas>
      <PageContent width={width} className={className}>
        {children}
      </PageContent>
    </PageCanvas>
  )
}
