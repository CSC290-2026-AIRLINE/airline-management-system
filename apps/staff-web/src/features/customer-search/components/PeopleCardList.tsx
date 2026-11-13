import { ChevronRight } from 'lucide-react'
import { cn } from '@staff-web/lib/utils'
import type { Person } from '../types'
import { formatDateOfBirth, nationalityLabel, personName } from '../lib/format'
import { Avatar, TypeBadge } from './shared'

/**
 * Card list used in two places:
 *  - the narrow left column of the desktop split view (when a person is selected)
 *  - the mobile results list, which adds an ID/DOB/nationality summary line
 */

interface PeopleCardListProps {
  people: Person[]
  selectedId?: string | null
  onSelect: (person: Person) => void
  variant: 'desktop' | 'mobile'
}

export function PeopleCardList({ people, selectedId, onSelect, variant }: PeopleCardListProps) {
  const mobile = variant === 'mobile'
  return (
    <ul className="flex flex-col divide-y">
      {people.map((person) => (
        <li key={person.id}>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              selectedId === person.id && 'bg-accent',
            )}
            onClick={() => onSelect(person)}
            aria-current={selectedId === person.id ? 'true' : undefined}
          >
            <Avatar person={person} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{personName(person)}</span>
                {!mobile && person.thaiName ? <span className="text-muted-foreground">{person.thaiName}</span> : null}
                {mobile ? <TypeBadge person={person} /> : null}
              </span>
              {mobile ? (
                <span className="text-xs text-muted-foreground">
                  {person.id} · {formatDateOfBirth(person.dateOfBirth)} · {nationalityLabel(person.nationality)}
                </span>
              ) : (
                <TypeBadge person={person} />
              )}
            </span>
            {mobile ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
