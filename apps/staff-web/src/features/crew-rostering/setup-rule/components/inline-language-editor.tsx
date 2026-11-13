import { useState } from 'react'
import { formatLanguageList } from '../types/format'
import type { CountryLanguage, LanguageOption } from '../types/types'
import { Button, MultiSelect } from '../../shared/ui'

/**
 * The row-level editor the reference opens in place of the edit overlay.
 *
 * Toggling the row keeps the destination in view, so the operator can see which
 * mapping they are changing without losing their place in the table. Cancel
 * discards, Save hands the picked codes back to the page.
 */
export function InlineLanguageEditor({
  mapping,
  languages,
  onCancel,
  onSave,
}: {
  mapping: CountryLanguage
  languages: readonly LanguageOption[]
  onCancel: () => void
  onSave: (codes: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([...mapping.languages])
  const options = languages.map((language) => ({ value: language.code, label: language.name }))

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-info-bg px-4 py-3.5 lg:flex-row lg:items-center lg:gap-6">
      <div className="min-w-0">
        <p className="font-bold text-primary-text">Editing {mapping.country}</p>
        <p className="mt-0.5 text-xs text-primary-text/55">Currently {formatLanguageList(mapping.languages, languages).toLowerCase()}.</p>
      </div>

      {/* Full width: the dropdown panel is absolutely positioned and would be
          clipped by a narrow flex track. */}
      <MultiSelect
        label="Accepted languages"
        className="lg:w-72"
        placeholder="Select languages"
        options={options}
        selected={selected}
        onChange={setSelected}
      />

      <div className="flex items-center gap-3 lg:ml-auto lg:shrink-0">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onSave(selected)}>
          Save
        </Button>
      </div>
    </div>
  )
}
