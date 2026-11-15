import { formatHours, formatPairingLimit } from '../types/format'
import type { DefaultLimits } from '../types/types'
import { RuleCard } from './rule-card'

/**
 * The baseline numbers every assignment is checked against.
 *
 * Five tiles in a row on a wide screen. On a phone it is a heading and three bigger tiles (rest, duty and
 * flights over the 28-day cap), with the pairing limits as a line under them.
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
    <>
      <RuleCard title="Default limits — apply to every country" description="Pairing and crew legality baseline" className="max-lg:hidden">
        <div className="grid grid-cols-5 gap-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg bg-page-bg px-3.5 py-3">
              <p className="text-xl leading-none font-extrabold text-primary-text">{tile.value}</p>
              <p className="mt-1.5 text-[11px] font-medium text-primary-text/55">{tile.label}</p>
            </div>
          ))}
        </div>
      </RuleCard>

      <section className="lg:hidden">
        <h2 className="text-lg font-extrabold tracking-tight text-primary-text">Default limits</h2>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <PhoneTile value={formatHours(defaults.minRestHours)} label="Minimum rest" />
          <PhoneTile value={formatHours(defaults.maxDutyHours)} label="Max duty" />
          <PhoneTile value={`${defaults.maxFlightsPerDuty} / ${formatHours(defaults.hoursCap28d)}`} label="Flights · 28 days" />
        </div>
        <p className="mt-3 text-xs text-primary-text/55">{formatPairingLimit(defaults)}</p>
      </section>
    </>
  )
}

function PhoneTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border-desc/50 bg-card-bg px-3.5 py-3.5">
      <p className="text-xl leading-none font-extrabold text-primary-text">{value}</p>
      <p className="mt-2 text-[11px] text-primary-text/55">{label}</p>
    </div>
  )
}
