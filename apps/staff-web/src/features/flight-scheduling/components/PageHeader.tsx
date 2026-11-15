import type { ReactNode } from 'react'

// Page title, with the page's main button at the right.
interface PageHeaderProps {
  title: string
  children?: ReactNode
  action?: ReactNode
}

export function PageHeader({ title, children, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}
      </div>
      {action}
    </div>
  )
}
