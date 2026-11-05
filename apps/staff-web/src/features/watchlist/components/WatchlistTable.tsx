import editIcon from '../assets/edit.svg'
import { nationalityName } from '../nationalities'
import { entryName, formatDate, listTypes, maskedPassport, type WatchlistEntry } from '../watchlist.types'

export function WatchlistTable({ entries, onEdit }: { entries: WatchlistEntry[]; onEdit: (entry: WatchlistEntry) => void }) {
  if (!entries.length)
    return (
      <div className="wl-empty" role="status">
        <h2>No entries found</h2>
        <p>Try another name, passport number or filter.</p>
      </div>
    )

  return (
    <div className="wl-results">
      <table aria-label="Watchlist entries">
        <thead>
          <tr>
            {['Name', 'Date of birth', 'Nationality', 'Passport', 'List type', 'Status', 'Listed', 'Actions'].map((label) => (
              <th key={label} scope="col" className={label === 'Actions' ? 'wl-actions-heading' : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <th scope="row">{entryName(entry)}</th>
              <td data-label="Date of birth">{formatDate(entry.dateOfBirth)}</td>
              <td data-label="Nationality">{nationalityName(entry.nationality)}</td>
              <td data-label="Passport">{maskedPassport(entry.passportNumber || entry.passportLast4 || '')}</td>
              <td data-label="List type">{listTypes[entry.listType]}</td>
              <td className="wl-status-cell">
                <span className={`wl-chip wl-${entry.status}`}>{entry.status === 'active' ? 'Active' : 'Cleared'}</span>
              </td>
              <td data-label="Listed">{formatDate(entry.listedAt)}</td>
              <td className="wl-edit-cell">
                <button className="wl-edit" aria-label={`Edit ${entryName(entry)}`} onClick={() => onEdit(entry)}>
                  <img src={editIcon} alt="" width="18" height="18" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
