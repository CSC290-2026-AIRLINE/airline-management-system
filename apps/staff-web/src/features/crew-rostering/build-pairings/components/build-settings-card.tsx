import type { BuildPairingParams, LocalDate } from '../types/types'
import { Button, InputField, SelectDropdown } from './ui'

/** Build settings form: date range, base and the generate/clear actions. */
export function BuildSettingsCard({
  params,
  bases,
  dateError,
  hasGenerated,
  isLoading,
  onDateFromChange,
  onDateToChange,
  onBaseChange,
  onGenerate,
  onClear,
}: {
  params: BuildPairingParams
  bases: readonly string[]
  dateError: string | null
  hasGenerated: boolean
  isLoading: boolean
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onBaseChange: (value: string) => void
  onGenerate: () => void
  onClear: () => void
}) {
  return (
    <section className="rounded-2xl border border-border-desc/30 bg-card-bg px-6 py-5">
      <h2 className="text-xl font-semibold text-primary-text">Build settings</h2>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <InputField
          label="Date from"
          type="date"
          value={params.dateFrom}
          onChange={(event) => onDateFromChange(event.target.value)}
          className="w-[200px]"
        />
        <InputField
          label="Date to"
          type="date"
          value={params.dateTo}
          error={dateError ?? undefined}
          onChange={(event) => onDateToChange(event.target.value)}
          className="w-[200px]"
        />
        <SelectDropdown
          label="Base"
          value={params.base}
          options={bases}
          onChange={(event) => onBaseChange(event.target.value)}
          className="w-[190px]"
        />

        <div className="ml-auto flex items-center gap-3 pt-6">
          <Button variant="primary" onClick={onGenerate} disabled={isLoading || dateError !== null}>
            {isLoading ? 'Generating…' : 'Generate pairings'}
          </Button>
          <Button variant="outline" onClick={onClear} disabled={!hasGenerated || isLoading}>
            {hasGenerated ? 'Clear pairings' : 'Clear'}
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Empty state shown before the first generate. */
export function NoPairingsEmptyState() {
  return (
    <section className="flex min-h-75 flex-col items-center justify-center rounded-2xl border border-border-desc/30 bg-card-bg px-6 py-16">
      <EmptyFaceIcon />
      <h3 className="mt-6 text-lg font-bold text-primary-text">No pairings yet</h3>
      <p className="mt-2 text-sm text-primary-text/55">Pick the dates and a base above, then select Generate pairings.</p>
    </section>
  )
}

function EmptyFaceIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16 text-primary/30" aria-hidden="true">
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="4" />
      <circle cx="25" cy="28" r="2.5" fill="currentColor" />
      <circle cx="39" cy="28" r="2.5" fill="currentColor" />
      <path d="M26 40h12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** Shown in the inspector column when nothing is selected. */
export function NoSelectionEmptyState() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-border-desc/30 bg-card-bg px-6 py-12">
      <h3 className="text-lg font-bold text-primary-text">No pairing selected</h3>
      <p className="mt-2 text-sm text-primary-text/55">Select a pairing to see its flights and checks.</p>
    </div>
  )
}

/** Re-exported so route files do not need to import from two modules. */
export type { LocalDate }
