import { formatLanguageList, formatLanguageNames } from '../types/format'
import type { CountryLanguage, DefaultLimits, LanguageOption } from '../types/types'
import { Button, IconButton, InfoBox, PencilIcon } from '../../shared/ui'
import { InlineLanguageEditor } from './inline-language-editor'
import { RuleCard } from './rule-card'

const HEAD = 'pb-2.5 text-[11px] font-semibold tracking-wider text-primary-text/55 uppercase'

/** What every mapped destination asks of the roster: the local-crew rule, as a yellow tag. */
function RulePill({ required }: { required: boolean }) {
  return (
    <span className="inline-flex rounded-full bg-gold/25 px-3 py-1 text-[11px] font-bold whitespace-nowrap text-btn-yellow-hover">
      {required ? 'Local crew required' : 'Local crew optional'}
    </span>
  )
}

/**
 * Destination language mappings, the input to local-crew eligibility.
 *
 * A real table from `lg`, with the row's editor opening in place. Below that each destination is its own
 * card, because the country is the thing being read, and `Add country` sits above the card.
 */
export function CountryLanguagesTable({
  mappings,
  languages,
  defaults,
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
  defaults: DefaultLimits | null
  /** Row currently opened in place, or null. */
  editingId: string | null
  onAdd: () => void
  onEdit: (mapping: CountryLanguage) => void
  onRemove: (mapping: CountryLanguage) => void
  onInlineEdit: (mapping: CountryLanguage) => void
  onInlineCancel: () => void
  onInlineSave: (mapping: CountryLanguage, codes: string[]) => void
}) {
  const required = (defaults?.minLocalCrew ?? 1) > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end lg:hidden">
        <Button variant="outline" className="h-10 text-[13px]" onClick={onAdd}>
          + Add country
        </Button>
      </div>

      <RuleCard
        title="Local languages by country"
        description="These mappings determine local-crew coverage for each flight destination."
        action={
          <Button variant="outline" className="h-11 max-lg:hidden" onClick={onAdd}>
            Add country
          </Button>
        }
      >
        {/* The phone has its own one-line description. */}
        {mappings.length === 0 ? (
          <p className="py-6 text-center text-sm text-primary-text/55">
            No destination is mapped yet. Without a mapping, local-crew eligibility cannot be evaluated for that leg.
          </p>
        ) : (
          <>
            <table className="hidden w-full border-collapse text-left lg:table">
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>
                    Country
                  </th>
                  <th scope="col" className={HEAD}>
                    Local languages
                  </th>
                  <th scope="col" className={HEAD}>
                    Rule
                  </th>
                  <th scope="col" className={`${HEAD} text-right`}>
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
                    required={required}
                    editing={editingId === mapping.id}
                    onRemove={onRemove}
                    onInlineEdit={onInlineEdit}
                    onInlineCancel={onInlineCancel}
                    onInlineSave={onInlineSave}
                  />
                ))}
              </tbody>
            </table>

            <ul className="flex flex-col gap-3 lg:hidden">
              {mappings.map((mapping) => (
                <li key={mapping.id} className="rounded-xl border border-border-desc/50 px-4 py-3.5">
                  <MappingCard mapping={mapping} languages={languages} required={required} onEdit={onEdit} onRemove={onRemove} />
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-4">
          <InfoBox>These language mappings are applied automatically during roster validation.</InfoBox>
        </div>
      </RuleCard>
    </div>
  )
}

/**
 * One mapping as a table pair: the data row, plus the editor row underneath it
 * when this is the destination being edited.
 */
function MappingRows({
  mapping,
  languages,
  required,
  editing,
  onRemove,
  onInlineEdit,
  onInlineCancel,
  onInlineSave,
}: {
  mapping: CountryLanguage
  languages: readonly LanguageOption[]
  required: boolean
  editing: boolean
  onRemove: (mapping: CountryLanguage) => void
  onInlineEdit: (mapping: CountryLanguage) => void
  onInlineCancel: () => void
  onInlineSave: (mapping: CountryLanguage, codes: string[]) => void
}) {
  return (
    <>
      <tr className="border-b border-border-desc/30">
        <th scope="row" className="py-3.5 text-sm font-normal text-primary-text">
          {mapping.country}
        </th>
        <td className="py-3.5 text-sm text-primary-text">{formatLanguageNames(mapping.languages, languages)}</td>
        <td className="py-3.5">
          <RulePill required={required} />
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
          <td colSpan={4} className="py-3">
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

/** The stacked form of one mapping, used below `lg`. */
function MappingCard({
  mapping,
  languages,
  required,
  onEdit,
  onRemove,
}: {
  mapping: CountryLanguage
  languages: readonly LanguageOption[]
  required: boolean
  onEdit: (mapping: CountryLanguage) => void
  onRemove: (mapping: CountryLanguage) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold text-primary-text">{mapping.country}</p>
        <div className="flex shrink-0 items-center gap-3">
          {/* Desktop edits the row in place; a stacked card has no room for that,
              so the same pencil opens the overlay there. */}
          <button
            type="button"
            aria-label={`Edit ${mapping.country} languages`}
            title={`Edit ${mapping.country} languages`}
            onClick={() => onEdit(mapping)}
            className="text-primary-text"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Remove ${mapping.country} languages`}
            title={`Remove ${mapping.country} languages`}
            onClick={() => onRemove(mapping)}
            className="text-base leading-none font-bold text-invalid"
          >
            <span aria-hidden="true">—</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-primary-text/55">
        {mapping.countryCode.toUpperCase()} · {formatLanguageList(mapping.languages, languages)} · Active
      </p>
      <div>
        <RulePill required={required} />
      </div>
    </div>
  )
}
