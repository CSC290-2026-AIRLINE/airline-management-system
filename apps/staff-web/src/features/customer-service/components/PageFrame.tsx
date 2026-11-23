import type { ReactNode } from 'react'

interface PageFrameProps {
  title: string
  description: ReactNode
  /** Controls for the right of the header. */
  actions?: ReactNode
  children: ReactNode
}

/** A customer service page's header and body. The sidebar is the global one, provided by the `/complaints` layout route. */
export function PageFrame({ title, description, actions, children }: PageFrameProps) {
  return (
    <div className="flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pt-6 pb-10 font-sans min-[1100px]:px-[63px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions}
      </header>
      {children}
    </div>
  )
}
