import { useState, type ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronsUp, Coffee, Luggage, PlaneTakeoff, ShieldCheck, Zap, type LucideProps } from 'lucide-react'
import type { BenefitUse, BenefitUseKind, MemberSummary, TierInfo } from '../api/types'
import { BENEFIT_NAMES, benefitLines, nextTierAdds, type BenefitKey } from '../benefits'
import { formatDate, formatMiles } from '../format'
import { EmptyState } from './parts'
import { cx, focusRing, ui } from './ui'

const BENEFIT_ICON: Record<BenefitKey, ComponentType<LucideProps>> = {
  lounge: Coffee,
  baggage: Luggage,
  checkIn: Zap,
  boarding: PlaneTakeoff,
  upgrade: ChevronsUp,
  insurance: ShieldCheck,
}

const BENEFIT_HINT: Record<BenefitKey, string> = {
  lounge: 'Show your member number at the lounge desk. Needs a ticket for a flight leaving within 4 hours.',
  baggage: 'Added to the free allowance of your fare.',
  checkIn: 'Use the priority lane at the airport.',
  boarding: 'Board before other passengers.',
  upgrade: 'One cabin up on flights paid in cash, when seats are free.',
  insurance: 'Basic cover on each booking.',
}

const HISTORY_TABS: { kind: BenefitUseKind; label: string; title: string; empty: string }[] = [
  { kind: 'lounge_visit', label: 'Lounge visits', title: 'Lounge visit', empty: 'No lounge visits yet.' },
  { kind: 'upgrade', label: 'Upgrades', title: 'Complimentary upgrade', empty: 'No upgrades yet.' },
  { kind: 'insurance', label: 'Insurance policies', title: 'Travel insurance', empty: 'No insurance policies yet.' },
]

const HISTORY_ICON: Record<BenefitUseKind, ComponentType<LucideProps>> = {
  lounge_visit: Coffee,
  upgrade: ChevronsUp,
  insurance: ShieldCheck,
}

// C09 My Benefits, with C09b/C09c for the upgrade and insurance history tabs.
export function BenefitsPage({ member, tiers, uses }: { member: MemberSummary; tiers: TierInfo[]; uses: BenefitUse[] }) {
  const tier = tiers.find((t) => t.code === member.tier?.code) ?? null
  const next = tiers.find((t) => t.code === member.nextTier?.code) ?? null

  return (
    <>
      <section className="flex flex-col gap-4" aria-labelledby="current-benefits">
        <h2 id="current-benefits" className="text-xl font-bold sm:text-2xl">
          {tier ? `Your ${tier.name} benefits` : 'No tier benefits yet'}
        </h2>
        {tier ? (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {benefitLines(tier, tiers).map((line) => {
              const Icon = BENEFIT_ICON[line.key]
              return (
                <li key={line.key} className={cx(ui.card, 'flex gap-4 p-4 sm:flex-col sm:gap-0 sm:p-5', !line.included && 'opacity-70')}>
                  <span
                    className={cx(
                      'grid size-10 flex-none place-items-center rounded-lg',
                      line.included ? 'bg-[#fbe7a8] text-gold-ink' : 'bg-divider text-muted',
                    )}
                    aria-hidden="true"
                  >
                    <Icon size={18} />
                  </span>
                  <div className="flex flex-col gap-1 sm:mt-4">
                    <span className="text-[13px] font-medium">{BENEFIT_NAMES[line.key]}</span>
                    <strong className="text-lg leading-tight sm:text-[22px]">{valueText(line.key, line.included, line.value)}</strong>
                    <span className="text-xs text-muted">{line.included ? BENEFIT_HINT[line.key] : 'Not part of your tier.'}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">
            Reach a tier to unlock lounge access, extra baggage, priority lanes, upgrades and insurance.
          </p>
        )}
      </section>

      {next && member.nextTier && (
        <section className={cx(ui.card, 'flex flex-col gap-1.5 p-5')} aria-labelledby="next-tier">
          <h2 id="next-tier" className="text-base font-semibold">
            Reach {next.name}
          </h2>
          <p className="text-[13px]">{nextTierAdds(tier, next, tiers)}</p>
          <Link
            to="/loyalty"
            className={cx(
              'inline-flex w-fit items-center gap-1 rounded text-[13px] font-semibold text-warn no-underline hover:underline',
              focusRing,
            )}
          >
            {formatMiles(Math.max(0, next.minMiles - member.tierMiles))} more miles or {Math.max(0, next.minFlights - member.tierFlights)}{' '}
            more flights
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      )}

      <BenefitHistory uses={uses} />
      <p className="text-[11px] text-muted">
        Upgrades are given automatically within 24 hours of departure when a higher cabin has unsold seats. Insurance is a record on your
        booking only. No real insurer is contacted.
      </p>
    </>
  )
}

function valueText(key: BenefitKey, included: boolean, value: string | null) {
  if (!included) return 'No'
  if (key === 'upgrade' && value)
    return value === 'First in line' ? 'Yes, first in line' : `Yes, ${value.charAt(0).toLowerCase()}${value.slice(1)}`
  return value ?? 'Yes'
}

function BenefitHistory({ uses }: { uses: BenefitUse[] }) {
  const [kind, setKind] = useState<BenefitUseKind>('lounge_visit')
  const tab = HISTORY_TABS.find((t) => t.kind === kind) ?? HISTORY_TABS[0]
  const shown = uses.filter((u) => u.kind === kind)
  const Icon = HISTORY_ICON[kind]

  return (
    <section className="flex flex-col gap-3" aria-labelledby="history">
      <div className="flex flex-col gap-1">
        <h2 id="history" className="text-xl font-semibold">
          Benefit history
        </h2>
        <p className="text-xs text-muted">A record of the benefits you have used.</p>
      </div>
      <div className={ui.card}>
        <div
          role="tablist"
          aria-label="Benefit history"
          className="flex gap-5 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:px-5"
        >
          {HISTORY_TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              role="tab"
              id={`history-tab-${t.kind}`}
              aria-selected={t.kind === kind}
              aria-controls="history-panel"
              onClick={() => setKind(t.kind)}
              className={cx(
                '-mb-px cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-0 py-3.5 text-[13px] whitespace-nowrap text-muted',
                'aria-selected:border-navy aria-selected:font-semibold aria-selected:text-ink',
                focusRing,
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="history-panel" aria-labelledby={`history-tab-${kind}`}>
          {shown.length === 0 ? (
            <EmptyState title={tab.empty} body="Benefits you use show here." />
          ) : (
            <ul className="m-0 list-none p-0">
              {shown.map((u) => (
                <li
                  key={u.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-divider px-4 py-4 last:border-0 sm:grid-cols-[auto_1fr_1fr_auto] sm:px-5"
                >
                  <span
                    className="row-span-2 grid size-9 place-items-center rounded-lg bg-[#e8eef7] text-link sm:row-span-1"
                    aria-hidden="true"
                  >
                    <Icon size={16} />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-muted">{formatDate(u.usedAt)}</span>
                    <span className="text-[13px] font-semibold">{tab.title}</span>
                  </div>
                  <span className="text-xs text-muted sm:text-[13px]">{u.route}</span>
                  <span className="col-start-2 text-xs text-muted sm:col-start-auto sm:text-right sm:text-[13px]">{u.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
