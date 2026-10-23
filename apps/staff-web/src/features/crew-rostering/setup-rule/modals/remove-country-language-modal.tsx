import { formatCrewCount, formatLanguageNames } from '../types/format'
import type { CountryLanguage, LanguageOption } from '../types/types'
import { BaseModalOverlay, Button } from '../../shared/ui'

/**
 * Confirmation before dropping a destination's language mapping.
 *
 * The crew count is repeated here because it is the number that makes the
 * mapping worth keeping: removing it does not just edit a list, it decides
 * whether anyone counts as local crew on that leg.
 */
export function RemoveCountryLanguageModal({
  mapping,
  languages,
  onCancel,
  onConfirm,
}: {
  mapping: CountryLanguage
  languages: readonly LanguageOption[]
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <BaseModalOverlay
      width="max-w-md"
      onClose={onCancel}
      title="Remove country language?"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            <span aria-hidden="true">—</span>
            Remove
          </Button>
        </>
      }
    >
      <p className="text-sm text-primary-text/70">
        {mapping.country} loses its local-language mapping and local-crew checks recheck affected legs. This can&rsquo;t be undone.
      </p>

      <p className="mt-5 text-xs font-semibold text-primary-text/55">Mapping to remove</p>
      <div className="mt-2 rounded-xl border border-border-desc/40 bg-page-bg px-4 py-3.5">
        <p className="text-xs text-primary-text/55">Local languages</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="font-display text-lg font-bold text-primary-text">{mapping.country}</p>
          <ul className="flex flex-wrap items-center gap-1.5">
            {mapping.languages.map((code) => (
              <li key={code} className="rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary">
                {formatLanguageNames([code], languages)}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-1.5 text-sm text-primary-text/65">{formatCrewCount(mapping.speakingCrew)} speak it</p>
      </div>
    </BaseModalOverlay>
  )
}
