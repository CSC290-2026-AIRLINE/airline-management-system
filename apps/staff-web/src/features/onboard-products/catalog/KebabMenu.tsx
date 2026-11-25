// Three-dot menu with a list of actions, built on the shadcn dropdown (it portals out of table cells and scroll areas).

import { MoreVertical } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@staff-web/components/ui/dropdown-menu'

export interface KebabAction {
  label: string
  onSelect: () => void
  destructive?: boolean
}

interface Props {
  actions: KebabAction[]
  label?: string
}

export function KebabMenu({ actions, label = 'Actions' }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label}>
          <MoreVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => (
          <DropdownMenuItem key={a.label} variant={a.destructive ? 'destructive' : 'default'} onSelect={a.onSelect}>
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
