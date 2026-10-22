import type { Person } from '../types'
import { formatDateOfBirth, nationalityLabel } from '../lib/format'
import { Avatar, TypeBadge } from './shared'

/**
 * The full-width desktop table used when no person is selected.
 * Columns match the design: NAME | DATE OF BIRTH | NATIONALITY | ID.
 *
 * The wrapper scrolls sideways rather than letting the columns be crushed: the
 * table has a `min-width` below which its fixed columns would leave NAME too
 * narrow for an avatar and a name. See `cs-table-scroll` in the stylesheet.
 */

interface PeopleTableProps {
  people: Person[]
  onSelect: (person: Person) => void
}

export function PeopleTable({ people, onSelect }: PeopleTableProps) {
  return (
    <div className="cs-table-scroll">
      <table className="cs-table">
        <caption className="cs-visually-hidden">Customer search results</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Date of birth</th>
            <th scope="col">Nationality</th>
            <th scope="col">ID</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id} className="cs-table__row" onClick={() => onSelect(person)}>
              <td>
                <button
                  type="button"
                  className="cs-table__name"
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect(person)
                  }}
                >
                  <Avatar person={person} />
                  <span className="cs-table__identity">
                    <span className="cs-table__name-row">
                      <span className="cs-table__fullname">
                        {person.firstName} {person.lastName}
                      </span>
                      {person.thaiName ? <span className="cs-table__thai">{person.thaiName}</span> : null}
                    </span>
                    <span className="cs-table__badge">
                      <TypeBadge person={person} />
                    </span>
                  </span>
                </button>
              </td>
              <td className="cs-table__cell">{formatDateOfBirth(person.dateOfBirth)}</td>
              <td className="cs-table__cell">{nationalityLabel(person.nationality)}</td>
              <td className="cs-table__cell cs-table__cell--id">{person.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
