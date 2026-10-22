import type { Person } from '../types'
import { formatDateOfBirth, nationalityLabel, personName } from '../lib/format'
import { ChevronRightIcon } from './Icons'
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
  if (variant === 'desktop') {
    return (
      <ul className="cs-cards">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              className={`cs-cards__item ${selectedId === person.id ? 'is-selected' : ''}`}
              onClick={() => onSelect(person)}
              aria-current={selectedId === person.id ? 'true' : undefined}
            >
              <Avatar person={person} />
              <span className="cs-cards__identity">
                <span className="cs-cards__name-row">
                  <span className="cs-cards__fullname">{personName(person)}</span>
                  {person.thaiName ? <span className="cs-cards__thai">{person.thaiName}</span> : null}
                </span>
                <TypeBadge person={person} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="cs-cards is-mobile">
      {people.map((person) => (
        <li key={person.id}>
          <button type="button" className="cs-cards__item" onClick={() => onSelect(person)}>
            <Avatar person={person} />
            <span className="cs-cards__identity">
              <span className="cs-cards__name-row">
                <span className="cs-cards__fullname">{personName(person)}</span>
                <TypeBadge person={person} />
              </span>
              <span className="cs-cards__meta">
                {person.id} · {formatDateOfBirth(person.dateOfBirth)} · {nationalityLabel(person.nationality)}
              </span>
            </span>
            <ChevronRightIcon className="cs-cards__chevron" />
          </button>
        </li>
      ))}
    </ul>
  )
}
