import type { ReactNode } from 'react'
import { PageCanvas, PageContent, type PageWidth } from '@customer-web/components/Page'

/** Page frame shared by every account screen, on the shared page shell. Profile is a detail page; setup is a short form. */
export default function AccountPage({
  className,
  width = 'standard',
  children,
}: {
  className?: string
  width?: PageWidth
  children: ReactNode
}) {
  return (
    <PageCanvas>
      <PageContent width={width} className={className}>
        {children}
      </PageContent>
    </PageCanvas>
  )
}
