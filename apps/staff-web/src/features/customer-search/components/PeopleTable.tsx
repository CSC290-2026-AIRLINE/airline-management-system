import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { Person } from '../types'
import { formatDateOfBirth, nationalityLabel } from '../lib/format'
import { Avatar, TypeBadge } from './shared'

/** The full-width desktop table used when no person is selected. Columns: Name | Date of birth | Nationality | ID. */

interface PeopleTableProps {
  people: Person[]
  onSelect: (person: Person) => void
}

export function PeopleTable({ people, onSelect }: PeopleTableProps) {
  return (
    <Table>
      <caption className="sr-only">Customer search results</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Name</TableHead>
          <TableHead scope="col">Date of birth</TableHead>
          <TableHead scope="col">Nationality</TableHead>
          <TableHead scope="col">ID</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => (
          <TableRow key={person.id} className="cursor-pointer" onClick={() => onSelect(person)}>
            <TableCell>
              <button
                type="button"
                className="flex items-center gap-3 text-left"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(person)
                }}
              >
                <Avatar person={person} />
                <span className="flex flex-col items-start gap-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">
                      {person.firstName} {person.lastName}
                    </span>
                    {person.thaiName ? <span className="text-muted-foreground">{person.thaiName}</span> : null}
                  </span>
                  <TypeBadge person={person} />
                </span>
              </button>
            </TableCell>
            <TableCell>{formatDateOfBirth(person.dateOfBirth)}</TableCell>
            <TableCell>{nationalityLabel(person.nationality)}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{person.id}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
