import { Badge } from '@staff-web/components/ui/badge'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { cn } from '@staff-web/lib/utils'
import type { ScreenDto, ScreenKind } from '../types'

/** What every locked row says when you hover it. */
export const LOCKED_TIP = 'Core and Admin screens can’t be given or taken away, and an admin role always sees every screen'

/**
 * The rows of one feature group — a checkbox, the screen name, and the badge on the right.
 *
 * The lock rules live here so the Role access matrix and the Create role dialog cannot drift apart:
 *   - a `core` screen is ticked and locked — everybody has it;
 *   - an `admin` screen is locked — only an admin role sees it;
 *   - an `assignable` screen can be ticked and unticked, unless the role is an admin role (which sees everything).
 *
 * `isChecked` is a callback rather than a set, because whether a core or admin screen shows as ticked depends on the
 * role, not on the grants.
 */
export function ScreenRows({
  screens,
  isChecked,
  unsavedIds,
  isAdminRole,
  onToggle,
}: {
  screens: ScreenDto[]
  isChecked: (screen: ScreenDto) => boolean
  /** Ids whose tick state differs from the last save — they carry the "Unsaved" badge. */
  unsavedIds: Set<string>
  isAdminRole: boolean
  onToggle: (screenId: string, kind: ScreenKind) => void
}) {
  return (
    <ul>
      {screens.map((s) => {
        const locked = s.kind !== 'assignable' || isAdminRole
        const checked = isChecked(s)
        const unsaved = unsavedIds.has(s.id)
        const row = (
          <li
            key={s.id}
            className={cn(
              'flex h-12 items-center gap-5 border-b border-border pr-1.5 pl-4 text-sm text-foreground max-tablet:h-10 max-tablet:gap-3 max-tablet:border-0 max-tablet:pl-0',
              locked ? 'cursor-default hover:bg-accent' : 'cursor-pointer hover:bg-accent',
            )}
            onClick={() => onToggle(s.id, s.kind)}
          >
            <Checkbox
              checked={checked}
              aria-disabled={locked}
              aria-label={s.name}
              className={cn(
                locked && 'data-[state=checked]:border-input data-[state=checked]:bg-muted data-[state=checked]:text-muted-foreground',
              )}
              onClick={(e) => {
                e.stopPropagation()
                onToggle(s.id, s.kind)
              }}
            />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            {s.kind === 'core' && (
              <Badge variant="secondary" className="w-20 text-muted-foreground">
                Core
              </Badge>
            )}
            {s.kind === 'admin' && !isAdminRole && (
              <Badge variant="secondary" className="w-20 text-muted-foreground">
                Admin
              </Badge>
            )}
            {unsaved && <Badge className="w-20 bg-warning-soft text-warning">Unsaved</Badge>}
            {locked && <span className="sr-only">{LOCKED_TIP}</span>}
          </li>
        )
        if (!locked) return row
        return (
          <Tooltip key={s.id}>
            <TooltipTrigger asChild>{row}</TooltipTrigger>
            <TooltipContent side="top" align="start" className="bg-foreground px-2 py-1.5 font-sans text-white [&>svg]:hidden">
              {LOCKED_TIP}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </ul>
  )
}
