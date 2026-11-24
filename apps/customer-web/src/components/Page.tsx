import type { ReactNode } from 'react'
import { cn } from '@customer-web/lib/utils'

/*
 * The page shell (redesign board 5, "Page shell and page title"). Every page except Home is built from these.
 *
 * One container, centred in the window, at most 79 rem wide (1200 px of content plus the gutter), with a gutter of 16 px
 * on a phone, 24 at 768 and 32 at 1280. The site header sits in the same container, so the logo, the page title and the
 * content share one left edge and nothing jumps when a customer moves between pages.
 *
 * Every page opens with the same navy banner: the title, a one-line description, the actions on the right and the area's
 * tabs along the bottom edge. It has one minimum height on every page, so the title and the content always start at the
 * same place.
 *
 * Content below the banner has three maximum widths inside the container, chosen by what the page holds:
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
 * `inverse` is white text, for the navy banner.
 */
export function PageHeader({
  title,
  description,
  tabs,
  actions,
  inverse = false,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  /** Underline tabs for the sections of this page's area. */
  tabs?: ReactNode
  actions?: ReactNode
  inverse?: boolean
  className?: string
}) {
  return (
    <header className={cn('grid gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid min-w-0 flex-1 basis-80 gap-2">
          <h1 className={cn('m-0', inverse && 'text-white')}>{title}</h1>
          {description ? <p className={cn('m-0 text-body', inverse ? 'text-white/80' : 'text-copy')}>{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs}
    </header>
  )
}

/**
 * The navy banner every page opens with. It runs edge to edge; the title block inside it uses the page container, so the
 * left edge still matches the site header. A fixed minimum height, with the tabs pinned to the bottom edge, keeps the
 * banner the same size from page to page.
 *
 * Inside it, controls switch to what reads on navy: underline tabs go white, a primary button turns white with navy text,
 * and the focus ring turns white.
 */
export function PageBanner({
  title,
  description,
  tabs,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  tabs?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div
      className={cn(
        'bg-navy text-white [--background:var(--color-navy)] [--ring:#ffffff]',
        // Underline tabs.
        '[&_[data-slot=tabs-list]]:border-white/25 [&_[data-slot=tabs-trigger]]:text-white/70 [&_[data-slot=tabs-trigger]:hover]:text-white',
        '[&_[data-slot=tabs-trigger][data-state=active]]:text-white [&_[data-slot=tabs-trigger]]:after:bg-white',
        // A primary button is navy, so on the banner it turns white.
        '[&_[data-slot=button]:is([data-variant=default],[data-variant=primary])]:bg-white [&_[data-slot=button]:is([data-variant=default],[data-variant=primary])]:text-navy',
        '[&_[data-slot=button]:is([data-variant=default],[data-variant=primary]):hover]:bg-white/90',
      )}
    >
      <div className={cn(pageContainer, 'flex min-h-36 flex-col pt-6 md:min-h-40 md:pt-8', tabs ? 'pb-0' : 'pb-6 md:pb-8')}>
        <PageHeader
          inverse
          title={title}
          description={description}
          tabs={tabs}
          actions={actions}
          className="flex flex-1 flex-col justify-between"
        />
      </div>
    </div>
  )
}

/** The page: the navy banner, then the content in one of the three widths. 48 px of space above the content (32 on a phone). */
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
      <PageBanner title={title} description={description} tabs={tabs} actions={actions} />
      <PageContent width={width} className={className}>
        {children}
      </PageContent>
    </PageCanvas>
  )
}

/** The background under the header: the canvas grey, with white cards on it. Fills the window below the header. */
export function PageCanvas({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-1 flex-col bg-muted text-left', className)}>{children}</div>
}

/** The main region: the shared container and one of the three widths. Use it for a page that has no title block of its own. */
export function PageContent({ width = 'standard', className, children }: { width?: PageWidth; className?: string; children: ReactNode }) {
  return (
    <main className={cn(pageContainer, 'flex-1 pt-8 pb-12 md:pt-12 md:pb-16')}>
      <div className={cn('flex flex-col gap-8', widths[width], className)}>{children}</div>
    </main>
  )
}
