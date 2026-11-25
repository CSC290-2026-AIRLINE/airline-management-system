import * as React from 'react'
import { cn } from '@customer-web/lib/utils'

/**
 * A selectable card: a flight, a passenger, a complaint type, a fare. shadcn has no tile component, so this is the one place
 * the pattern lives. Callers add layout classes (direction, padding, gap). `selected` outlines it in the primary colour and
 * sets `aria-pressed`, unless the caller gives its own `role` (tab, radio) and the matching aria attribute.
 */
function SelectTile({
  selected = false,
  className,
  role,
  type = 'button',
  ...props
}: Omit<React.ComponentProps<'button'>, 'aria-pressed'> & { selected?: boolean }) {
  return (
    <button
      type={type}
      role={role}
      data-slot="select-tile"
      data-selected={selected}
      aria-pressed={role ? undefined : selected}
      className={cn(
        'flex cursor-pointer rounded-lg border bg-card text-left text-card-foreground transition-colors outline-none',
        'hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'data-[selected=true]:border-primary data-[selected=true]:ring-1 data-[selected=true]:ring-primary',
        className,
      )}
      {...props}
    />
  )
}

export { SelectTile }
