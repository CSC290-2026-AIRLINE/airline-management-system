/**
 * The roster-run parameters at the top of the page.
 *
 * On desktop the fields and the pairing picker share one card; on mobile they split
 * into two, because the picker is its own block of content on a phone. The fields
 * themselves are rendered once and placed differently by each layout.
 */
import { InputField, SelectDropdown } from '../../shared/ui'
import type { AssignCrewParams } from '../types/types'

/** Phone: small caps above the field. From `lg`: the quieter sentence-case label. */
const LABEL = 'text-[11px] font-semibold tracking-wider text-label uppercase lg:text-xs lg:font-medium lg:tracking-normal lg:normal-case'

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
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 lg:mt-1 lg:grid-cols-3 lg:gap-x-6">
      <InputField
        label="Date from"
        type="date"
        value={params.dateFrom}
        labelClassName={LABEL}
        onChange={(event) => onDateFromChange(event.target.value)}
        className="min-w-0"
      />
      <InputField
        label="Date to"
        type="date"
        value={params.dateTo}
        error={dateError ?? undefined}
        labelClassName={LABEL}
        onChange={(event) => onDateToChange(event.target.value)}
        className="min-w-0"
      />
      <SelectDropdown
        label="Base"
        options={bases}
        value={params.base}
        labelClassName={LABEL}
        onChange={(event) => onBaseChange(event.target.value)}
        className="col-span-2 lg:col-span-1"
      />
    </div>
  )
}
