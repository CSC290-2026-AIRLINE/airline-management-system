import type { ReactNode } from 'react'

// Page title and its one-line explanation, as at the top of every staff screen.
interface PageHeaderProps {
  title: string
  children?: ReactNode
  action?: ReactNode // the page's main button, at the right of the title
}

export function PageHeader({ title, children, action }: PageHeaderProps) {
  return (
    <div className="fs-title-row">
      <div>
        <h1>{title}</h1>
        {children && <p className="fs-lede">{children}</p>}
      </div>
      {action}
    </div>
  )
}
