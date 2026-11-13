import type { BuildPairingParams } from '../types/types'
import { Button, EmptyFaceIcon, InputField, SelectDropdown } from '../../shared/ui'

/** Phone: small caps above the field. From `sm`: the quieter sentence-case label. */
const LABEL = 'text-[11px] font-semibold tracking-wider text-label uppercase sm:text-xs sm:font-medium sm:tracking-normal sm:normal-case'

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
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg px-4 py-4 sm:px-5 sm:py-5">
      <h2 className="text-lg font-bold text-primary-text sm:text-lg">Build settings</h2>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:items-start sm:gap-x-5 sm:gap-y-4">
        <InputField
          label="Date from"
          type="date"
          value={params.dateFrom}
          labelClassName={LABEL}
          onChange={(event) => onDateFromChange(event.target.value)}
          className="min-w-0 sm:w-52.5"
        />
        <InputField
          label="Date to"
          type="date"
          value={params.dateTo}
          error={dateError ?? undefined}
          labelClassName={LABEL}
          onChange={(event) => onDateToChange(event.target.value)}
          className="min-w-0 sm:w-52.5"
        />
        <SelectDropdown
          label="Base"
          value={params.base}
          options={bases}
          labelClassName={LABEL}
          onChange={(event) => onBaseChange(event.target.value)}
          className="col-span-2 sm:w-47.5"
        />

        <div className="col-span-2 flex flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center sm:gap-3 sm:pt-6">
          <Button
            variant="primary"
            className="h-11 w-full sm:h-10.5 sm:w-auto sm:px-8"
            onClick={onGenerate}
            disabled={isLoading || dateError !== null}
          >
            {isLoading ? 'Generating…' : 'Generate pairings'}
          </Button>
          <div className="hidden sm:block">
            <Button variant="outline" className="h-10.5 px-6" onClick={onClear} disabled={!hasGenerated || isLoading}>
              {hasGenerated ? 'Clear pairings' : 'Clear'}
            </Button>
          </div>
          {/* The phone mockup has no Clear button; keep the action, but as a quiet link once there is something to clear. */}
          {hasGenerated && (
            <button
              type="button"
              onClick={onClear}
              disabled={isLoading}
              className="self-center py-1 text-sm font-semibold text-primary-text/60 underline-offset-4 hover:underline disabled:opacity-50 sm:hidden"
            >
              Clear pairings
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** Empty state shown before the first generate. */
export function NoPairingsEmptyState() {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border-desc/40 bg-card-bg px-6 py-12 text-center sm:min-h-80">
      <EmptyFaceIcon className="h-12 w-12 text-slate sm:h-14 sm:w-14" />
      <h3 className="mt-5 text-lg font-bold text-primary-text">No pairings yet</h3>
      <p className="mt-2 text-sm text-primary-text/55">
        Pick the dates and a base above, then <span className="sm:hidden">tap</span>
        <span className="hidden sm:inline">select</span> Generate pairings.
      </p>
    </section>
  )
}

/** Shown beside the cards on a wide screen when nothing is selected. */
export function NoSelectionEmptyState() {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-border-desc/40 bg-card-bg px-6 py-12 text-center">
      <h3 className="text-base font-bold text-primary-text">No pairing selected</h3>
      <p className="mt-2 text-sm text-primary-text/55">Select a pairing to see its flights and checks.</p>
    </div>
  )
}
