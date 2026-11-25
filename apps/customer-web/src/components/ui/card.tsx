import * as React from 'react'
import { cn } from '@customer-web/lib/utils'

/*
 * The one card (redesign board 7): white surface, 1 px line border, 14 px radius, 24 px padding, no shadow at rest.
 * A card that is a link or a choice is `interactive` (raised on hover) and shows `selected` with a navy border and tint;
 * a card that is only a container stays flat.
 */
function Card({
  className,
  interactive = false,
  selected = false,
  ...props
}: React.ComponentProps<'div'> & { interactive?: boolean; selected?: boolean }) {
  return (
    <div
      data-slot="card"
      data-interactive={interactive || undefined}
      data-selected={selected || undefined}
      className={cn(
        'flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground transition-shadow',
        'data-[interactive]:cursor-pointer data-[interactive]:hover:shadow-raised',
        'data-[selected]:border-navy data-[selected]:bg-info-tint',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('leading-none font-semibold', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center px-6 [.border-t]:pt-6', className)} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
