import type { ReactNode } from 'react'
import statusDot from '../assets/status-dot.svg'

export function BiPageHeader({
  title,
  description,
  status,
  action,
}: {
  title: string
  description: string
  status: string
  action: ReactNode
}) {
  return (
    <header className="bi-page-header">
      <div className="bi-page-heading">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="bi-header-actions print:hidden">
        <span className="bi-status">
          <img src={statusDot} alt="" />
          {status}
        </span>
        {action}
      </div>
    </header>
  )
}
