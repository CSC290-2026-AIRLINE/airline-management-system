import { Search, X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import type { DisplayGroup } from '../screen-groups'
import type { ScreenDto, ScreenKind } from '../types'
import { ScreenRows } from './ScreenRows'

/**
 * The screen matrix — the wide part of the Role access card.
 *
 * One column, one group after another. The lock rules live in `ScreenRows`, shared with the Create role dialog so the
 * two cannot drift apart. The search box filters by screen name, by feature number (`F4`) and by feature label
 * (`Pricing`) — see `filterGroups` for the exact rules.
 */
export function ScreenMatrix({
  groups,
  granted,
  pending,
  isAdminRole,
  onToggle,
  search,
  onSearchChange,
}: {
  groups: DisplayGroup[]
  /** The saved grants for the selected role. */
  granted: Set<string>
  /** The unsaved edits, or `null` when there are none. */
  pending: Set<string> | null
  /** True when the selected role is an admin role — then every row is ticked and locked. */
  isAdminRole: boolean
  onToggle: (screenId: string, kind: ScreenKind) => void
  search: string
  onSearchChange: (value: string) => void
}) {
  const shown = pending ?? granted

  /** Whether a screen shows as ticked: core for everyone, admin screens for an admin role, the rest by grant. */
  function isChecked(s: ScreenDto): boolean {
    if (s.kind === 'core') return true
    if (isAdminRole) return true
    if (s.kind === 'admin') return false
    return shown.has(s.id)
  }

  /** The ids whose tick state differs from the last save. */
  const unsavedIds = new Set<string>()
  if (pending !== null) {
    for (const g of groups) {
      for (const s of g.screens) {
        if (s.kind !== 'assignable') continue
        if (shown.has(s.id) !== granted.has(s.id)) unsavedIds.add(s.id)
      }
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {/* Search ---------------------------------------------------------- */}
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search feature or screen — e.g. F4, Pricing, Refunds"
          aria-label="Search screens"
          className="pr-9 pl-9"
        />
        {search !== '' && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => onSearchChange('')}
            aria-label="Clear the search"
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Groups ---------------------------------------------------------- */}
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {search.trim() === '' ? 'No screens registered yet.' : `No screens match “${search.trim()}”.`}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.title}>
              <header className="bg-muted py-2.5 pl-3 text-xs font-semibold text-foreground uppercase">
                {group.title}
                {group.locked && group.key !== 'core' && ' · Admin only — locked'}
              </header>
              <ScreenRows
                screens={group.screens}
                isChecked={isChecked}
                unsavedIds={unsavedIds}
                isAdminRole={isAdminRole}
                onToggle={onToggle}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
