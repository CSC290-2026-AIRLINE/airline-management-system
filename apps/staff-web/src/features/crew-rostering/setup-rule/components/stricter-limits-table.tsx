import { formatHours, formatPairings } from '../types/format'
import type { CountryLimit, DefaultLimits } from '../types/types'
import { Button, IconButton, PencilIcon } from '../../shared/ui'
import { RuleCard } from './rule-card'

/**
 * Destinations that limit rest or duty more tightly than the baseline, under a
 * fixed baseline row so the comparison is visible without opening anything.
 *
 * The baseline row carries no actions: it is the reference, not an editable
 * record. `AFFECTS` is dropped below `md`, where the numbers would otherwise
 * push the country name onto two lines.
 */
export function StricterLimitsTable({
  defaults,
  limits,
  onAdd,
  onEdit,
  onRemove,
}: {
  defaults: DefaultLimits
  limits: readonly CountryLimit[]
  onAdd: () => void
  onEdit: (limit: CountryLimit) => void
  onRemove: (limit: CountryLimit) => void
}) {
  return (
    <RuleCard
      title="Stricter limits by destination country"
      description="A country can raise minimum rest or lower maximum duty; values recheck every affected leg."
      action={
        <Button variant="outline" onClick={onAdd}>
          Add country rule
        </Button>
      }
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border-desc/40 text-[10px] font-semibold tracking-wider text-primary-text/50 uppercase">
            <th scope="col" className="pb-2.5 font-semibold">
              Country
            </th>
            <th scope="col" className="pb-2.5 font-semibold">
              Min rest
            </th>
            <th scope="col" className="pb-2.5 font-semibold">
              Max duty
            </th>
            <th scope="col" className="hidden pb-2.5 font-semibold md:table-cell">
              Affects
            </th>
            <th scope="col" className="pb-2.5 text-right font-semibold">
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          <tr className="border-b border-border-desc/25">
            <th scope="row" className="py-3 text-sm font-bold text-primary-text">
              Default <span className="font-medium text-primary-text/50">· all countries</span>
            </th>
            <td className="py-3 text-sm text-primary-text">{formatHours(defaults.minRestHours)}</td>
            <td className="py-3 text-sm text-primary-text">{formatHours(defaults.maxDutyHours)}</td>
            <td className="hidden py-3 text-sm text-primary-text/70 md:table-cell">{formatPairings(null)}</td>
            <td className="py-3 text-right text-sm text-primary-text/40">—</td>
          </tr>

          {limits.map((limit) => (
            <tr key={limit.id} className="border-b border-border-desc/25 last:border-b-0">
              <th scope="row" className="py-3 text-sm font-medium text-primary-text">
                <span className="md:hidden">{limit.countryCode} · </span>
                {limit.country}
              </th>
              <td className="py-3 text-sm text-primary-text">{formatHours(limit.minRestHours)}</td>
              <td className="py-3 text-sm text-primary-text">{formatHours(limit.maxDutyHours)}</td>
              <td className="hidden py-3 text-sm text-primary-text/70 md:table-cell">{formatPairings(limit.affectedPairings)}</td>
              <td className="py-3">
                <div className="flex items-center justify-end gap-3">
                  <IconButton label={`Edit ${limit.country} limits`} onClick={() => onEdit(limit)}>
                    <PencilIcon className="h-4 w-4" />
                  </IconButton>
                  <RemoveButton label={`Remove ${limit.country} limits`} onClick={() => onRemove(limit)} />
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
  )
}

/**
 * Destructive row action. The word `Remove` needs the room a phone does not have,
 * so below `md` it collapses to the dash the mobile reference shows.
 */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex items-center text-sm font-semibold text-invalid underline-offset-4 hover:underline"
    >
      <span aria-hidden="true" className="hidden sm:inline">
        Remove
      </span>
      <span aria-hidden="true" className="sm:hidden">
        —
      </span>
    </button>
  )
}
