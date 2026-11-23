import { Button, InputField, SelectDropdown } from '../../shared/ui'
import { ALL_ROLES } from '../types/types'
import type { CrewFilters } from '../types/types'

/** Small caps above each field, as the mockups draw the filter row. */
const LABEL = 'text-[11px] font-semibold tracking-wider text-label uppercase'

/**
 * Search box, the two filter dropdowns and the create CTA.
 *
 * On a phone the search takes a row, the two dropdowns share the next one and the button is full width.
 * From `lg` it is one line: the search takes the free space and the button sits on the right.
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
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 lg:flex lg:items-end lg:gap-4">
      <InputField
        label="Search"
        type="search"
        className="col-span-2 lg:flex-1"
        labelClassName={LABEL}
        value={filters.search}
        placeholder="Name or employee number"
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <SelectDropdown
        label="Base airport"
        className="lg:w-44"
        labelClassName={LABEL}
        value={filters.base}
        onChange={(event) => onBaseChange(event.target.value)}
        options={[{ value: 'all', label: 'All bases' }, ...bases.map((base) => ({ value: base, label: base }))]}
      />

      <SelectDropdown
        label="Role"
        className="lg:w-44"
        labelClassName={LABEL}
        value={filters.role}
        onChange={(event) => onRoleChange(event.target.value)}
        options={[{ value: 'all', label: 'All roles' }, ...ALL_ROLES.map((role) => ({ value: role, label: role }))]}
      />

      <Button variant="primary" onClick={onCreate} className="col-span-2 h-11 lg:col-span-1 lg:ml-auto lg:px-6">
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
