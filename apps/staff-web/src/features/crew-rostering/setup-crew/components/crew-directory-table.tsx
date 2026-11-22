import type { ReactNode } from 'react'
import { formatHours, formatHoursCompact, formatLanguages, fullName, licenceWarning } from '../types/format'
import type { CrewMember } from '../types/types'
import { EmptyFaceIcon, RoleBadge } from '../../shared/ui'

const COLUMNS = ['Name', 'Employee no.', 'Role', 'Base', 'Fleet', 'Languages', 'Hours (28 days)'] as const

/**
 * The crew directory.
 *
 * A real `<table>` from `lg`, where seven columns fit beside the sidebar. Below that it is a stack of
 * compact rows: a horizontally scrolling table on a phone hides data behind a swipe, and the name,
 * role and hours are what matter there. The table's header row stays when nobody matches, with the
 * empty state under it, so the page does not jump when a search finds nothing.
 */
export function CrewDirectoryTable({
  crew,
  onSelect,
  empty,
}: {
  crew: readonly CrewMember[]
  onSelect: (crewId: string) => void
  /** Shown instead of rows when `crew` is empty. */
  empty?: ReactNode
}) {
  return (
    <>
      {/* lg and up */}
      <div className="hidden lg:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-table-head">
              {COLUMNS.map((header) => (
                <th key={header} scope="col" className="px-4 py-3.5 text-xs font-bold tracking-wider text-primary-text uppercase">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {crew.map((member) => (
              <CrewTableRow key={member.id} crew={member} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
        {crew.length === 0 && empty}
      </div>

      {/* below lg */}
      <div className="lg:hidden">
        {crew.length === 0 ? (
          empty
        ) : (
          <ul className="flex flex-col gap-3">
            {crew.map((member) => (
              <CrewListCard key={member.id} crew={member} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function CrewTableRow({ crew, onSelect }: { crew: CrewMember; onSelect: (crewId: string) => void }) {
  const warning = licenceWarning(crew.licenceExpiresOn)

  return (
    <tr
      onClick={() => onSelect(crew.id)}
      tabIndex={0}
      role="link"
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(crew.id)
        }
      }}
      title="View profile · licence, ratings and duties"
      className={`cursor-pointer border-b border-border-desc/30 transition-colors last:border-b-0 hover:bg-info-bg/60 focus-visible:bg-info-bg/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
        crew.justCreated ? 'bg-green-tint' : ''
      }`}
    >
      <th scope="row" className="px-4 py-4 font-normal text-primary-text">
        {fullName(crew)}
      </th>
      <td className="px-4 py-4 whitespace-nowrap text-primary-text/80">{crew.employeeNo}</td>
      <td className="px-4 py-4">
        <RoleBadge role={crew.role} />
      </td>
      <td className="px-4 py-4 whitespace-nowrap text-primary-text/80">{crew.base}</td>
      <td className="px-4 py-4 whitespace-nowrap text-primary-text/80">{crew.fleet}</td>
      <td className="px-4 py-4 whitespace-nowrap text-primary-text/80">{formatLanguages(crew.languages)}</td>
      <td className={`px-4 py-4 whitespace-nowrap ${warning ? 'text-invalid' : 'text-primary-text/80'}`}>
        {formatHours(crew)}
        {warning && ` · ${warning}`}
      </td>
    </tr>
  )
}

/** Phone stand-in for a table row: the name and number, then one line of everything else. */
function CrewListCard({ crew, onSelect }: { crew: CrewMember; onSelect: (crewId: string) => void }) {
  const warning = licenceWarning(crew.licenceExpiresOn)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(crew.id)}
        className={`flex w-full flex-col gap-1 rounded-xl border px-4 py-3.5 text-left transition-colors hover:border-primary/40 ${
          crew.justCreated ? 'border-valid/40 bg-green-tint' : 'border-border-desc/50 bg-card-bg'
        }`}
      >
        <span className="text-sm font-bold text-primary-text">
          {fullName(crew)} · {crew.employeeNo}
        </span>
        <span className={`text-xs leading-relaxed ${warning ? 'text-invalid' : 'text-primary-text/60'}`}>
          {crew.role} · {crew.base} · {crew.fleet} · {formatLanguages(crew.languages)} · {formatHoursCompact(crew)}
          {warning && ` · ${warning}`}
        </span>
      </button>
    </li>
  )
}

/** Shown when the filters match nobody, with the search term echoed back. */
export function NoCrewMatchState({ searchTerm, onClear }: { searchTerm: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center lg:py-14">
      <EmptyFaceIcon className="h-12 w-12 text-slate lg:h-14 lg:w-14" />
      <p className="mt-4 text-base font-bold text-primary-text lg:text-lg">
        {searchTerm.trim() ? <>No crew match “{searchTerm.trim()}”</> : 'No crew match these filters'}
      </p>
      <p className="mt-1.5 text-sm text-primary-text/60">
        <span className="lg:hidden">Check the spelling, or clear the search.</span>
        <span className="hidden lg:inline">Check the spelling, or clear the search and filters.</span>
      </p>
      <button type="button" onClick={onClear} className="mt-3 text-sm font-semibold text-blue-700 hover:text-blue-800">
        Clear search
      </button>
    </div>
  )
}
