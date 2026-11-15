import { formatHours, formatLocalCrew } from '../types/format'
import type { CountryLimit, DefaultLimits } from '../types/types'
import { Button, IconButton, PencilIcon } from '../../shared/ui'
import { RuleCard } from './rule-card'

/** Small caps over each column, as the mockup draws the table head. */
const HEAD = 'pb-2.5 text-[11px] font-semibold tracking-wider text-primary-text/55 uppercase'

/**
 * Destinations that limit rest or duty more tightly than the baseline, under a
 * fixed baseline row so the comparison is visible without opening anything.
 *
 * The baseline row can be edited but not removed: every country rule is measured against it. On a phone the
 * same rules are a compact card (country, rest, duty and two icon actions) and `Add rule` moves to the top
 * of the tab as a full-width button.
 */
export function StricterLimitsTable({
  defaults,
  limits,
  onEditDefaults,
  onAdd,
  onEdit,
  onRemove,
}: {
  defaults: DefaultLimits
  limits: readonly CountryLimit[]
  onEditDefaults: () => void
  onAdd: () => void
  onEdit: (limit: CountryLimit) => void
  onRemove: (limit: CountryLimit) => void
}) {
  return (
    <>
      <RuleCard
        className="max-lg:hidden"
        title="Stricter limits by destination country"
        description="A country can raise minimum rest or lower maximum duty; values recheck every affected leg."
        action={
          <Button variant="outline" className="h-11" onClick={onAdd}>
            Add country rule
          </Button>
        }
      >
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th scope="col" className={HEAD}>
                Country
              </th>
              <th scope="col" className={HEAD}>
                Min rest
              </th>
              <th scope="col" className={HEAD}>
                Max duty
              </th>
              <th scope="col" className={HEAD}>
                Local cabin crew
              </th>
              <th scope="col" className={`${HEAD} text-right`}>
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-b border-border-desc/30">
              <th scope="row" className="py-3 text-sm font-bold text-primary-text">
                Default <span className="font-bold">· all countries</span>
              </th>
              <td className="py-3 text-sm text-primary-text">{formatHours(defaults.minRestHours)}</td>
              <td className="py-3 text-sm text-primary-text">{formatHours(defaults.maxDutyHours)}</td>
              <td className="py-3 text-sm text-primary-text/60">{formatLocalCrew(defaults.minLocalCrew)}</td>
              <td className="py-3">
                <div className="flex items-center justify-end gap-3">
                  <IconButton label="Edit default limits" onClick={onEditDefaults}>
                    <PencilIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              </td>
            </tr>

            {limits.map((limit) => (
              <tr key={limit.id} className="border-b border-border-desc/30 last:border-b-0">
                <th scope="row" className="py-3 text-sm font-normal text-primary-text">
                  {limit.country}
                </th>
                <td className="py-3 text-sm text-primary-text">{formatHours(limit.minRestHours)}</td>
                <td className="py-3 text-sm text-primary-text">{formatHours(limit.maxDutyHours)}</td>
                <td className="py-3 text-sm text-primary-text/60">{formatLocalCrew(limit.minLocalCrew)}</td>
                <td className="py-3">
                  <div className="flex items-center justify-end gap-3">
                    <IconButton label={`Edit ${limit.country} limits`} onClick={() => onEdit(limit)}>
                      <PencilIcon className="h-4 w-4" />
                    </IconButton>
                    <button
                      type="button"
                      aria-label={`Remove ${limit.country} limits`}
                      title={`Remove ${limit.country} limits`}
                      onClick={() => onRemove(limit)}
                      className="text-sm font-semibold text-invalid underline-offset-4 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {limits.length === 0 && (
          <p className="py-6 text-center text-sm text-primary-text/55">
            No destination overrides the default yet. Every country is checked against the baseline above.
          </p>
        )}
      </RuleCard>

      <div className="flex flex-col gap-5 lg:hidden">
        <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold tracking-tight text-primary-text">Country rules</h2>
            <span className="rounded-full bg-green-tint px-3 py-1 text-[11px] font-bold text-valid">Effective</span>
          </div>

          {limits.length === 0 ? (
            <p className="mt-4 text-sm text-primary-text/55">No destination overrides the default yet.</p>
          ) : (
            <table className="mt-3 w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border-desc/30 text-xs text-primary-text/55">
                  <th scope="col" className="pb-2 font-normal">
                    Country
                  </th>
                  <th scope="col" className="pb-2 font-normal">
                    Rest
                  </th>
                  <th scope="col" className="pb-2 font-normal">
                    Duty
                  </th>
                  <th scope="col" className="pb-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {limits.map((limit) => (
                  <tr key={limit.id} className="border-b border-border-desc/30 last:border-b-0">
                    <th scope="row" className="py-3 text-sm font-normal text-primary-text">
                      {limit.country}
                    </th>
                    <td className="py-3 text-sm text-primary-text">{formatHours(limit.minRestHours)}</td>
                    <td className="py-3 text-sm text-primary-text">{formatHours(limit.maxDutyHours)}</td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          aria-label={`Edit ${limit.country} limits`}
                          title={`Edit ${limit.country} limits`}
                          onClick={() => onEdit(limit)}
                          className="text-primary-text"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${limit.country} limits`}
                          title={`Remove ${limit.country} limits`}
                          onClick={() => onRemove(limit)}
                          className="text-base leading-none font-bold text-invalid"
                        >
                          <span aria-hidden="true">—</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <button
            type="button"
            onClick={onEditDefaults}
            className="mt-4 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800"
          >
            Edit default limits
          </button>
        </section>
      </div>
    </>
  )
}

/** Phone only: the primary action sits at the top of the tab, full width. */
export function AddRuleButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="primary" fullWidth className="h-11 lg:hidden" onClick={onClick}>
      + Add rule
    </Button>
  )
}
