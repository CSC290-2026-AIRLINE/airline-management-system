import type { ReactNode } from 'react'
import '../pricing.css'

// Inter for everything on these pages.
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'

interface PricingShellProps {
  title: string
  description: string
  // Buttons for the right of the page header (e.g. "Open price simulator").
  actions?: ReactNode
  children: ReactNode
}

/** A pricing page's header and body. The sidebar is the global one, provided by the `/pricing` layout route. */
export function PricingShell({ title, description, actions, children }: PricingShellProps) {
  return (
    <div className="pr-shell">
      {/* React 19 hoists this into <head> once, so the font loads only on pricing pages and index.html stays shared. */}
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />
      <main className="pr-main">
        <header className="pr-header">
          <div>
            <h1 className="pr-title">{title}</h1>
            <p className="pr-subtitle">{description}</p>
          </div>
          {actions}
        </header>
        {children}
      </main>
    </div>
  )
}
