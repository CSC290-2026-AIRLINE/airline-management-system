import { formatLanguageNames } from '../types/format'
import type { CountryLanguage, LanguageOption } from '../types/types'
import { BaseModalOverlay, Button } from '../../shared/ui'

/**
 * Confirmation before dropping a destination's language mapping.
 *
 * It names the languages that are about to stop counting as local, because removing
 * the mapping does not just edit a list: it decides whether anyone counts as local
 * crew on that leg.
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
      variant="plain"
      width="max-w-md"
      onClose={onCancel}
      title="Remove country language?"
      footer={
        <>
          <Button variant="outline" className="h-11" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" className="h-11" onClick={onConfirm}>
            <span aria-hidden="true">—</span>
            Remove
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        {mapping.country} loses its local-language mapping and local-crew checks recheck affected legs. This can&rsquo;t be undone.
      </p>

      <p className="mt-4 text-sm font-bold text-primary-text">Mapping to remove</p>
      <div className="mt-2 rounded-xl border border-border-desc/50 px-4 py-3.5">
        <p className="text-xs text-primary-text/55">Local languages</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xl font-extrabold tracking-tight text-primary-text">{mapping.country}</p>
          <ul className="flex flex-wrap items-center gap-1.5">
            {mapping.languages.map((code) => (
              <li key={code} className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] font-bold text-blue-700">
                {formatLanguageNames([code], languages)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </BaseModalOverlay>
  )
}
