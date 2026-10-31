import { formatCrewCount, formatLanguageNames, formatMobileMappingSubline } from '../types/format'
import type { CountryLanguage, LanguageOption } from '../types/types'
import { Button, IconButton, InfoBox, PencilIcon } from '../../shared/ui'
import { InlineLanguageEditor } from './inline-language-editor'
import { RuleCard } from './rule-card'

/**
 * Destination language mappings, the input to local-crew eligibility.
 *
 * A real table from `md` up. Below that the reference stacks each destination
 * into its own card, because five columns do not fit a phone and the country is
 * the thing being read.
 */
export function CountryLanguagesTable({
  mappings,
  languages,
  editingId,
  onAdd,
  onEdit,
  onRemove,
  onInlineEdit,
  onInlineCancel,
  onInlineSave,
}: {
  mappings: readonly CountryLanguage[]
  languages: readonly LanguageOption[]
  /** Row currently opened in place, or null. */
  editingId: string | null
  onAdd: () => void
  onEdit: (mapping: CountryLanguage) => void
  onRemove: (mapping: CountryLanguage) => void
  onInlineEdit: (mapping: CountryLanguage) => void
  onInlineCancel: () => void
  onInlineSave: (mapping: CountryLanguage, codes: string[]) => void
}) {
  return (
    <RuleCard
      title="Local languages by country"
      description="These mappings determine local-crew coverage for each flight destination."
      action={
        <Button variant="outline" onClick={onAdd}>
          Add country
        </Button>
      }
    >
      {mappings.length === 0 ? (
        <p className="py-6 text-center text-sm text-primary-text/55">
          No destination is mapped yet. Without a mapping, local-crew eligibility cannot be evaluated for that leg.
        </p>
      ) : (
        <>
          <table className="hidden w-full border-collapse text-left md:table">
            <thead>
              <tr className="border-b border-border-desc/40 text-[10px] font-semibold tracking-wider text-primary-text/50 uppercase">
                <th scope="col" className="pb-2.5 font-semibold">
                  Country
                </th>
                <th scope="col" className="pb-2.5 font-semibold">
                  Local languages
                </th>
                <th scope="col" className="pb-2.5 font-semibold">
                  Crew who speak it
                </th>
                <th scope="col" className="pb-2.5 font-semibold">
                  Rule
                </th>
                <th scope="col" className="pb-2.5 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {mappings.map((mapping) => (
                <MappingRows
                  key={mapping.id}
                  mapping={mapping}
                  languages={languages}
                  editing={editingId === mapping.id}
                  onRemove={onRemove}
                  onInlineEdit={onInlineEdit}
                  onInlineCancel={onInlineCancel}
                  onInlineSave={onInlineSave}
                />
              ))}
            </tbody>
          </table>

          <ul className="flex flex-col gap-3 md:hidden">
            {mappings.map((mapping) => (
              <li key={mapping.id} className="rounded-lg border border-border-desc/40 px-4 py-3.5">
                <MappingCard mapping={mapping} languages={languages} onEdit={onEdit} onRemove={onRemove} />
              </li>
            ))}
          </ul>
        </>
      )}

      <InfoBox>These language mappings are applied automatically during roster validation.</InfoBox>
    </RuleCard>
  )
}

/**
 * One mapping as a table pair: the data row, plus the editor row underneath it
 * when this is the destination being edited.
 */
function MappingRows({
  mapping,
  languages,
  editing,
  onRemove,
  onInlineEdit,
  onInlineCancel,
  onInlineSave,
}: {
  mapping: CountryLanguage
  languages: readonly LanguageOption[]
  editing: boolean
  onRemove: (mapping: CountryLanguage) => void
  onInlineEdit: (mapping: CountryLanguage) => void
  onInlineCancel: () => void
  onInlineSave: (mapping: CountryLanguage, codes: string[]) => void
}) {
  return (
    <>
      <tr className="border-b border-border-desc/25">
        <th scope="row" className="py-3.5 text-sm font-medium text-primary-text">
          {mapping.country}
        </th>
        <td className="py-3.5 text-sm text-primary-text">{formatLanguageNames(mapping.languages, languages)}</td>
        <td className="py-3.5 text-sm text-primary-text/70">{formatCrewCount(mapping.speakingCrew)}</td>
        <td className="py-3.5">
          <span className="inline-flex items-center rounded-full bg-secondary/25 px-2.5 py-1 text-[10px] font-bold tracking-wide text-btn-yellow-hover uppercase">
            Local crew required
          </span>
        </td>
        <td className="py-3.5">
          <div className="flex items-center justify-end gap-3">
            <IconButton label={`Edit ${mapping.country} languages`} onClick={() => onInlineEdit(mapping)}>
              <PencilIcon className="h-4 w-4" />
            </IconButton>
            <button
              type="button"
              aria-label={`Remove ${mapping.country} languages`}
              title={`Remove ${mapping.country} languages`}
              onClick={() => onRemove(mapping)}
              className="text-sm font-semibold text-invalid underline-offset-4 hover:underline"
            >
              Remove
            </button>
          </div>
        </td>
      </tr>

      {editing && (
        <tr>
          <td colSpan={5} className="pb-3">
            <InlineLanguageEditor
              mapping={mapping}
              languages={languages}
              onCancel={onInlineCancel}
              onSave={(codes) => onInlineSave(mapping, codes)}
            />
          </td>
        </tr>
      )}
    </>
  )
}

/** The stacked form of one mapping, used below `md`. */
function MappingCard({
  mapping,
  languages,
  onEdit,
  onRemove,
}: {
  mapping: CountryLanguage
  languages: readonly LanguageOption[]
  onEdit: (mapping: CountryLanguage) => void
  onRemove: (mapping: CountryLanguage) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold text-primary-text">{mapping.country}</p>
        <div className="flex shrink-0 items-center gap-2">
          {/* Desktop edits the row in place; a stacked card has no room for that,
              so the same pencil opens the overlay there. */}
          <IconButton label={`Edit ${mapping.country} languages`} onClick={() => onEdit(mapping)}>
            <PencilIcon className="h-4 w-4" />
          </IconButton>
          <button
            type="button"
            aria-label={`Remove ${mapping.country} languages`}
            title={`Remove ${mapping.country} languages`}
            onClick={() => onRemove(mapping)}
            className="inline-flex items-center px-1 text-base font-bold text-invalid"
          >
            <span aria-hidden="true">—</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-primary-text/55">{formatMobileMappingSubline(mapping, languages)}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-primary-text/70">{formatCrewCount(mapping.speakingCrew)}</span>
        <span className="inline-flex items-center rounded-full bg-secondary/25 px-2.5 py-1 text-[10px] font-bold tracking-wide text-btn-yellow-hover uppercase">
          Local crew required
        </span>
      </div>
    </div>
  )
}
