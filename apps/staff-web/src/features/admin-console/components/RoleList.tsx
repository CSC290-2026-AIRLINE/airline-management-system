import { Trash2 } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { cn } from '@staff-web/lib/utils'
import type { RoleSummary } from '../types'

/**
 * The role list — the narrow left column of the Role access card.
 *
 * Roles are listed A–Z with the number of staff that hold them. The Admin role carries an "All screens" badge, because
 * an admin role sees every screen whatever its grants say. A role that nobody holds can be deleted from here; a role
 * that staff still hold has no delete button at all, so the rule is visible before anyone clicks.
 */
export function RoleList({
  roles,
  selectedId,
  onSelect,
  onDelete,
  disabled = false,
}: {
  roles: RoleSummary[]
  selectedId: string | null
  onSelect: (roleId: string) => void
  /** Opens the delete confirmation for that role. */
  onDelete: (role: RoleSummary) => void
  /** Set while the page has unsaved edits — switching roles would lose them. */
  disabled?: boolean
}) {
  return (
    <div className="flex w-70 shrink-0 flex-col gap-2 max-tablet:w-full">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase">Roles · {roles.length}</span>
        <span className="text-xs text-muted-foreground">A–Z</span>
      </div>
      {roles.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No roles yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5" aria-label="Roles">
          {roles.map((role) => {
            const selected = role.id === selectedId
            const canDelete = role.staff_count === 0 && !role.is_admin
            return (
              <li key={role.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(role.id)}
                  disabled={disabled && !selected}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    selected ? 'bg-primary text-white' : 'text-foreground hover:bg-accent',
                    disabled && !selected && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className={cn('min-w-0 flex-1 truncate', selected ? 'font-semibold' : 'font-medium')}>{role.name}</span>
                  {role.is_admin && (
                    <Badge
                      variant="secondary"
                      className={cn('shrink-0 text-xs', selected ? 'bg-white/20 text-white' : 'text-muted-foreground')}
                    >
                      All screens
                    </Badge>
                  )}
                  <span className={cn('shrink-0 text-xs tabular-nums', selected ? 'text-white/80' : 'text-muted-foreground')}>
                    {role.staff_count} staff
                  </span>
                </button>
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn('shrink-0 text-muted-foreground hover:text-danger', selected && 'text-white/80 hover:text-white')}
                    onClick={() => onDelete(role)}
                    aria-label={`Delete the ${role.name} role`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
