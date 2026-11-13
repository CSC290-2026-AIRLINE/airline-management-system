import { formatHours, formatLanguages, fullName, initials, licenceWarning } from '../types/format'
import type { CrewMember } from '../types/types'
import { EmptyFaceIcon, RoleBadge } from '../../shared/ui'

const COLUMNS = ['Name', 'Employee no.', 'Role', 'Base', 'Fleet', 'Languages', 'Hours (28 days)'] as const

/**
 * The crew directory.
 *
 * A real `<table>` from `md` up, where seven columns fit. Below that it becomes a
 * stacked list of cards — a horizontally scrolling table on a 390px phone hides
 * data behind a swipe, and the name plus hours are what matter there.
 */
export function CrewDirectoryTable({ crew, onSelect }: { crew: readonly CrewMember[]; onSelect: (crewId: string) => void }) {
  return (
    <>
      {/* md and up */}
      <div className="hidden overflow-hidden rounded-xl border border-border-desc/40 bg-card-bg md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border-desc/40 bg-page-bg">
              {COLUMNS.map((header) => (
                <th key={header} scope="col" className="px-4 py-3 text-xs font-semibold tracking-wider text-primary-text/55 uppercase">
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
      </div>

      {/* below md */}
      <ul className="flex flex-col gap-3 md:hidden">
        {crew.map((member) => (
          <CrewListCard key={member.id} crew={member} onSelect={onSelect} />
        ))}
      </ul>
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
      className={`cursor-pointer border-b border-border-desc/20 transition-colors last:border-b-0 hover:bg-page-bg focus-visible:bg-page-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
        crew.justCreated ? 'bg-valid-bg' : ''
      }`}
    >
      <th scope="row" className="px-4 py-3.5 font-semibold text-primary-text">
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-bold text-primary">
            {initials(crew)}
          </span>
          <span className="flex flex-col">
            <span>{fullName(crew)}</span>
            {crew.justCreated && <span className="text-xs font-medium text-valid">New profile</span>}
          </span>
        </span>
      </th>
      <td className="px-4 py-3.5 font-medium whitespace-nowrap text-primary-text/80">{crew.employeeNo}</td>
      <td className="px-4 py-3.5">
        <RoleBadge role={crew.role} />
      </td>
      <td className="px-4 py-3.5 font-medium whitespace-nowrap text-primary-text/80">{crew.base}</td>
      <td className="px-4 py-3.5 font-medium whitespace-nowrap text-primary-text/80">{crew.fleet}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-primary-text/70">{formatLanguages(crew.languages)}</td>
      <td className={`px-4 py-3.5 whitespace-nowrap ${warning ? 'font-semibold text-invalid' : 'text-primary-text/70'}`}>
        {formatHours(crew)}
        {warning && <span className="block text-xs font-medium">{warning}</span>}
      </td>
    </tr>
  )
}

/** Phone and tablet-width stand-in for a table row. */
function CrewListCard({ crew, onSelect }: { crew: CrewMember; onSelect: (crewId: string) => void }) {
  const warning = licenceWarning(crew.licenceExpiresOn)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(crew.id)}
        className={`flex w-full flex-col gap-3 rounded-xl border border-border-desc/40 bg-card-bg px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-page-bg ${
          crew.justCreated ? 'border-valid/40 bg-valid-bg' : ''
        }`}
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/8 text-sm font-bold text-primary">
            {initials(crew)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold text-primary-text">{fullName(crew)}</span>
            <span className="text-xs text-primary-text/60">
              {crew.employeeNo} · {crew.base} · {crew.fleet}
            </span>
          </span>
          <RoleBadge role={crew.role} />
        </span>

        <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
          <span className="text-primary-text/60">{formatLanguages(crew.languages)}</span>
          <span className={`font-semibold ${warning ? 'text-invalid' : 'text-primary-text/70'}`}>
            {formatHours(crew)}
            {warning && <span className="block">{warning}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

/** Shown when the filters match nobody, with the search term echoed back. */
export function NoCrewMatchState({ searchTerm, onClear }: { searchTerm: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border-desc/40 bg-card-bg px-6 py-14 text-center">
      <EmptyFaceIcon className="h-14 w-14 text-border-desc" />
      <p className="mt-4 font-display text-xl font-bold text-primary-text">
        {searchTerm.trim() ? <>No crew match “{searchTerm.trim()}”</> : 'No crew match these filters'}
      </p>
      <p className="mt-1.5 text-sm text-primary-text/60">Check the spelling, or clear the search and filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 text-sm font-semibold text-primary underline underline-offset-4 hover:text-btn-navy"
      >
        Clear search
      </button>
    </div>
  )
}
