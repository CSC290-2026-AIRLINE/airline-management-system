import { Pencil } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { nationalityName } from '../nationalities'
import { entryName, formatDate, listTypes, maskedPassport, type WatchlistEntry } from '../watchlist.types'

const columns = ['Name', 'Date of birth', 'Nationality', 'Passport', 'List type', 'Status', 'Listed']

export function WatchlistTable({ entries, onEdit }: { entries: WatchlistEntry[]; onEdit: (entry: WatchlistEntry) => void }) {
  if (!entries.length)
    return (
      <div role="status" className="flex flex-col items-center gap-1 rounded-lg border bg-card px-6 py-16 text-center">
        <h2 className="m-0 font-sans text-base font-semibold text-foreground">No entries found</h2>
        <p className="text-sm text-muted-foreground">Try another name, passport number or filter.</p>
      </div>
    )

  return (
    <div className="rounded-lg border bg-card">
      <Table aria-label="Watchlist entries">
        <TableHeader>
          <TableRow>
            {columns.map((label) => (
              <TableHead key={label} scope="col">
                {label}
              </TableHead>
            ))}
            <TableHead scope="col" className="text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableHead scope="row" className="font-medium text-foreground">
                {entryName(entry)}
              </TableHead>
              <TableCell>{formatDate(entry.dateOfBirth)}</TableCell>
              <TableCell>{nationalityName(entry.nationality)}</TableCell>
              <TableCell>{maskedPassport(entry.passportNumber || entry.passportLast4 || '')}</TableCell>
              <TableCell>{listTypes[entry.listType]}</TableCell>
              <TableCell>
                <Badge variant={entry.status === 'active' ? 'default' : 'secondary'}>
                  {entry.status === 'active' ? 'Active' : 'Cleared'}
                </Badge>
              </TableCell>
              <TableCell>{formatDate(entry.listedAt)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${entryName(entry)}`} onClick={() => onEdit(entry)}>
                  <Pencil />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
