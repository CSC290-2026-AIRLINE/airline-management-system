/**
 * The roster-run parameters at the top of the page.
 *
 * On desktop the fields and the pairing picker share one card; on mobile they split
 * into two, because the picker is its own block of content on a phone. The fields
 * themselves are rendered once and placed differently by each layout.
 */
import { InputField, SelectDropdown } from '../../shared/ui'
import type { AssignCrewParams } from '../types/types'

export interface RosterRunFieldsProps {
  params: AssignCrewParams
  bases: readonly string[]
  dateError: string | null
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onBaseChange: (value: string) => void
}

export function RosterRunFields({ params, bases, dateError, onDateFromChange, onDateToChange, onBaseChange }: RosterRunFieldsProps) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:mt-2 lg:grid-cols-3 lg:gap-4">
      <InputField
        label="Date from"
        type="date"
        value={params.dateFrom}
        error={dateError ?? undefined}
        onChange={(event) => onDateFromChange(event.target.value)}
      />
      <InputField label="Date to" type="date" value={params.dateTo} onChange={(event) => onDateToChange(event.target.value)} />
      <SelectDropdown
        label="Base"
        options={bases}
        value={params.base}
        onChange={(event) => onBaseChange(event.target.value)}
        className="sm:col-span-2 lg:col-span-1"
      />
    </div>
  )
}
