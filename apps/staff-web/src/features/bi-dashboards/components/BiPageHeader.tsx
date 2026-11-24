import { useContext, type ReactNode } from 'react'
import statusDot from '../assets/status-dot.svg'
import { BiTabsContext } from './BiTabsContext'

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
  const tabs = useContext(BiTabsContext)
  return (
    <>
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
      {tabs}
    </>
  )
}
