import type { FormEventHandler, ReactNode } from 'react'
import { Card as UiCard, CardContent } from '@staff-web/components/ui/card'

interface CardProps {
  first?: boolean // drops the top margin for the card that opens a page
  as?: 'section' | 'form' // a card that is a form passes onSubmit
  onSubmit?: FormEventHandler<HTMLFormElement>
  children: ReactNode
}

// A bordered section on the shadcn Card.
export function Card({ first = false, as = 'section', onSubmit, children }: CardProps) {
  return (
    <UiCard className={first ? 'mt-0' : 'mt-6'}>
      <CardContent>
        {as === 'form' ? (
          <form className="grid gap-4 [&>[data-slot=button]]:justify-self-start" onSubmit={onSubmit}>
            {children}
          </form>
        ) : (
          <section className="grid gap-4 [&>[data-slot=button]]:justify-self-start">{children}</section>
        )}
      </CardContent>
    </UiCard>
  )
}
