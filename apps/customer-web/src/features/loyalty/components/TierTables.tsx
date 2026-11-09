import { Check, Minus } from 'lucide-react'
import type { TierInfo } from '../api/types'
import { BENEFIT_KEYS, BENEFIT_NAMES, benefitLines, benefitSentence } from '../benefits'
import { formatMiles } from '../format'
import { TierCard } from './parts'
import { cx, TIER_ART } from './ui'

const qualify = (t: TierInfo) => `${formatMiles(t.minMiles)} miles or ${t.minFlights} flights`

export function ReachTierHeading() {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-2xl font-bold sm:text-[32px]">Reach a tier</h2>
      <p className="text-[13px] text-muted sm:text-sm">
        Qualify on miles or on flights in the last 12 months, whichever comes first. A tier lasts 12 months.
      </p>
    </div>
  )
}

// C01 desktop: benefits down the side, one column per tier.
export function TierTable({ tiers }: { tiers: TierInfo[] }) {
  const lines = tiers.map((t) => benefitLines(t, tiers))
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <td className="w-[30%]" />
          {tiers.map((t) => (
            <th key={t.code} scope="col" className="border-b-2 border-ink px-3 pb-5 align-bottom font-normal">
              <div className="mx-auto flex w-full max-w-[200px] flex-col items-center gap-2 text-center">
                <TierCard code={t.code} name={t.name} className="w-32" />
                <span className="mt-1 text-sm font-bold tracking-[0.12em] uppercase">{t.name}</span>
                <span className="text-xs text-muted">{qualify(t)}</span>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {BENEFIT_KEYS.map((key, row) => (
          <tr key={key}>
            <th scope="row" className="border-b border-divider py-4 pr-3 text-left font-semibold">
              {BENEFIT_NAMES[key]}
            </th>
            {lines.map((tierLines, col) => {
              const line = tierLines[row]
              return (
                <td key={tiers[col].code} className="border-b border-divider px-3 py-4 text-center">
                  {line.included ? (
                    <span className="inline-flex flex-col items-center gap-1.5">
                      <span className="grid size-[18px] place-items-center rounded-full bg-navy text-white">
                        <Check size={11} strokeWidth={3} aria-label="Included" />
                      </span>
                      {line.value && <span className="text-xs font-medium">{line.value}</span>}
                    </span>
                  ) : (
                    <Minus size={14} className="mx-auto text-[#c2c9d4]" aria-label="Not included" />
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// C02 Welcome, and the Join page on a phone: one card per tier with its benefits listed, included ones first.
export function TierColumns({ tiers }: { tiers: TierInfo[] }) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
      {tiers.map((t) => {
        const lines = benefitLines(t, tiers).sort((a, b) => Number(b.included) - Number(a.included))
        return (
          <section key={t.code} className="flex flex-col gap-3 md:px-6 md:first:pl-0 md:last:pr-0" aria-label={`${t.name} tier`}>
            <div className={cx('flex flex-col gap-1 rounded-lg px-4 py-4', TIER_ART[t.code])}>
              <span className="text-[11px] font-extrabold tracking-[0.12em] uppercase">{t.name}</span>
              <span className="text-base font-bold">{qualify(t)}</span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {lines.map((l) => (
                <li
                  key={l.key}
                  className={cx(
                    'flex items-center gap-3 border-b border-divider py-2.5 text-[13px] last:border-0',
                    !l.included && 'text-[#98a1b0]',
                  )}
                >
                  {l.included ? (
                    <Check size={16} className="flex-none text-ok" aria-label="Included" />
                  ) : (
                    <Minus size={16} className="flex-none text-[#c2c9d4]" aria-label="Not included" />
                  )}
                  {l.included ? benefitSentence(l) : BENEFIT_NAMES[l.key]}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
