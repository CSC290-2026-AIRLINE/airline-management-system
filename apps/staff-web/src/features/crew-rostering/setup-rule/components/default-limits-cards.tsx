import { formatHours, formatPairingLimit } from '../types/format'
import type { DefaultLimits } from '../types/types'
import { RuleCard } from './rule-card'

/**
 * The five baseline numbers every assignment is checked against.
 *
 * On a phone the tiles wrap two-up instead of shrinking to five columns, which
 * would leave the values too narrow to read.
 */
export function DefaultLimitsCards({ defaults }: { defaults: DefaultLimits }) {
  const tiles = [
    { value: formatHours(defaults.minRestHours), label: 'Min rest' },
    { value: formatHours(defaults.maxDutyHours), label: 'Max duty' },
    { value: String(defaults.maxFlightsPerDuty), label: 'Max flights' },
    { value: `${defaults.maxPairingDays} days`, label: 'Pairing length' },
    { value: formatHours(defaults.hoursCap28d), label: '28-day cap' },
  ]

  return (
    <RuleCard title="Default limits — apply to every country" description="Pairing and crew legality baseline">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-page-bg px-3.5 py-3">
            <p className="font-display text-xl leading-none font-bold text-primary-text">{tile.value}</p>
            <p className="mt-1.5 text-[11px] font-medium text-primary-text/55">{tile.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-primary-text/50">{formatPairingLimit(defaults)}</p>
    </RuleCard>
  )
}
