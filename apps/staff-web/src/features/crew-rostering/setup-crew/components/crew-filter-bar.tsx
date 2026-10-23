import { Button, PlusIcon, SearchInput, SelectDropdown } from '../../shared/ui'
import { ALL_ROLES } from '../types/types'
import type { CrewFilters } from '../types/types'

/**
 * Search box, the two filter dropdowns and the create CTA.
 *
 * Wraps to one column on a phone; from `md` the search takes the free space and
 * the dropdowns sit on one line, with the CTA pinned to the right.
 */
export function CrewFilterBar({
  filters,
  bases,
  resultCount,
  onSearchChange,
  onBaseChange,
  onRoleChange,
  onCreate,
}: {
  filters: CrewFilters
  bases: readonly string[]
  resultCount: number
  onSearchChange: (value: string) => void
  onBaseChange: (value: string) => void
  onRoleChange: (value: string) => void
  onCreate: () => void
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <SearchInput className="md:flex-1" value={filters.search} onValueChange={onSearchChange} placeholder="Name or employee number" />

      <SelectDropdown
        label="Base airport"
        className="md:w-44"
        value={filters.base}
        onChange={(event) => onBaseChange(event.target.value)}
        options={[{ value: 'all', label: 'All bases' }, ...bases.map((base) => ({ value: base, label: base }))]}
      />

      <SelectDropdown
        label="Role"
        className="md:w-48"
        value={filters.role}
        onChange={(event) => onRoleChange(event.target.value)}
        options={[{ value: 'all', label: 'All roles' }, ...ALL_ROLES.map((role) => ({ value: role, label: role }))]}
      />

      <Button variant="primary" onClick={onCreate} className="md:mb-0.5 shrink-0 self-start md:self-auto">
        <PlusIcon className="h-4 w-4" />
        Create crew profile
      </Button>

      {/* Screen-reader only: the table header already states the row count, but a
          filter change should also announce itself when the table is not in view. */}
      <p className="sr-only" role="status">
        {resultCount} crew shown
      </p>
    </div>
  )
}
