import type { ReactNode } from 'react'
import { cn } from '@customer-web/lib/utils'

/*
 * The page shell (redesign board 5, "Page shell and page title"). Every page except Home is built from these.
 *
 * One container, centred in the window, at most 79 rem wide (1200 px of content plus the gutter), with a gutter of 16 px
 * on a phone, 24 at 768 and 32 at 1280. The site header sits in the same container, so the logo, the page title and the
 * content share one left edge and nothing jumps when a customer moves between pages.
 *
 * Content has three maximum widths inside it, chosen by what the page holds, not by taste:
 *   narrow   640  a single-column form: sign-up, a short task
 *   standard 960  a list or a detail page, or a flow with one side panel
 *   wide     1200 a page with a side panel and a form, a search, a table
 * Pages that are tabs of one area share a width, so switching tabs never reflows the page.
 */
export const pageContainer = 'mx-auto w-full max-w-[79rem] px-4 md:px-6 xl:px-8'

const widths = {
  narrow: 'max-w-narrow',
  standard: 'max-w-standard',
  wide: 'max-w-wide',
} as const

export type PageWidth = keyof typeof widths

/**
 * The title block: a title, an optional one-line description, and optional tabs, in that order, always in the same place.
 * 8 px between title and description, 16 before the tabs. `actions` sit on the right of the title (an export button, say).
 */
export function PageHeader({
  title,
  description,
  tabs,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Underline tabs for the sections of this page's area. */
  tabs?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('grid gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid min-w-0 flex-1 basis-80 gap-2">
          <h1 className="m-0">{title}</h1>
          {description ? <p className="m-0 text-body text-copy">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs}
    </header>
  )
}

/**
 * The page: the canvas under the header, the shared container, a title block, and the content 32 px below it.
 * 48 px under the header (32 on a phone) and 64 (48) under the content.
 */
export function Page({
  width = 'standard',
  title,
  description,
  tabs,
  actions,
  className,
  children,
}: {
  width?: PageWidth
  title: ReactNode
  description?: ReactNode
  tabs?: ReactNode
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <PageCanvas>
      <PageContent width={width} className={className}>
        <PageHeader title={title} description={description} tabs={tabs} actions={actions} />
        {children}
      </PageContent>
    </PageCanvas>
  )
}

/** The background under the header: the canvas grey, with white cards on it. Fills the window below the header. */
export function PageCanvas({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-1 flex-col bg-muted text-left', className)}>{children}</div>
}

/** The main region: the shared container and one of the three widths. Use it when the page builds its own header. */
export function PageContent({ width = 'standard', className, children }: { width?: PageWidth; className?: string; children: ReactNode }) {
  return (
    <main className={cn(pageContainer, 'flex-1 pt-8 pb-12 md:pt-12 md:pb-16')}>
      <div className={cn('flex flex-col gap-8', widths[width], className)}>{children}</div>
    </main>
  )
}
