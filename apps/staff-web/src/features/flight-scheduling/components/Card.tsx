import type { FormEventHandler, ReactNode } from 'react'

interface CardProps {
  first?: boolean // drops the top margin for the card that opens a page
  as?: 'section' | 'form' // a card that is a form passes onSubmit
  onSubmit?: FormEventHandler<HTMLFormElement>
  children: ReactNode
}

// A white bordered section.
export function Card({ first = false, as = 'section', onSubmit, children }: CardProps) {
  const className = first ? 'fs-card fs-card-first' : 'fs-card'
  return as === 'form' ? (
    <form className={className} onSubmit={onSubmit}>
      {children}
    </form>
  ) : (
    <section className={className}>{children}</section>
  )
}
