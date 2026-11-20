import { useState, type ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronsUp, Coffee, Luggage, PlaneTakeoff, ShieldCheck, Zap, type LucideProps } from 'lucide-react'
import type { BenefitUse, BenefitUseKind, MemberSummary, TierInfo } from '../api/types'
import { BENEFIT_NAMES, benefitLines, nextTierAdds, type BenefitKey } from '../benefits'
import { Button } from '@customer-web/components/ui/button'
import { Card } from '@customer-web/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'
import { formatDate, formatMiles } from '../format'
import { EmptyState } from './parts'
import { cx } from './ui'

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
  checkIn: 'Skip the main queue at the check-in counter.',
  boarding: 'Board before other passengers.',
  upgrade: 'One cabin up on flights paid in cash, when seats are free.',
  insurance: 'On every booking you make.',
}

// The C09 cards use shorter labels than the benefit names elsewhere.
const CARD_LABEL: Record<BenefitKey, string> = { ...BENEFIT_NAMES, checkIn: 'Priority check-in' }

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
          <div role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {benefitLines(tier, tiers).map((line) => {
              const Icon = BENEFIT_ICON[line.key]
              return (
                <Card
                  key={line.key}
                  role="listitem"
                  className={cx('flex-row gap-4 p-4 shadow-none sm:flex-col sm:gap-0 sm:p-5', !line.included && 'opacity-70')}
                >
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
                    <span className="text-[13px] font-medium">{CARD_LABEL[line.key]}</span>
                    <strong className="text-lg leading-tight sm:text-[22px]">{valueText(line.key, line.included, line.value)}</strong>
                    <span className="text-xs text-muted">{line.included ? BENEFIT_HINT[line.key] : 'Not part of your tier.'}</span>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted">
            Reach a tier to unlock lounge access, extra baggage, priority lanes, upgrades and insurance.
          </p>
        )}
      </section>

      {next && member.nextTier && (
        <Card className="gap-1.5 p-5 shadow-none" aria-labelledby="next-tier">
          <h2 id="next-tier" className="text-base font-semibold">
            Reach {next.name}
          </h2>
          <p className="text-[13px]">{nextTierAdds(tier, next, tiers)}</p>
          <Button asChild variant="link" className="h-auto w-fit px-0 text-[13px] text-warn">
            <Link to="/loyalty">
              {formatMiles(Math.max(0, next.minMiles - member.tierMiles))} more miles or {Math.max(0, next.minFlights - member.tierFlights)}{' '}
              more flights
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </Card>
      )}

      <BenefitHistory uses={uses} />
      <p className="text-[11px] text-muted">
        Upgrades are given automatically within 24 hours of departure when a higher cabin has unsold seats. Insurance is a record on your
        booking only. No real insurer is contacted.
      </p>
    </>
  )
}

// Card headlines from C09, e.g. "You + 1 guest", "+10 kg free", "After Platinum members".
function valueText(key: BenefitKey, included: boolean, value: string | null) {
  if (!included) return 'No'
  switch (key) {
    case 'lounge':
      return value?.replace(/^Member/, 'You') ?? 'Yes'
    case 'baggage':
      return `${value} free`
    case 'checkIn':
      return 'Priority lane'
    case 'boarding':
      return 'Board first'
    case 'upgrade':
      return value === 'First in line' || !value ? 'First in line' : `${value} members`
    case 'insurance':
      return value === 'Included' ? 'Basic cover included' : 'Basic cover at member price'
    default: {
      const unreachable: never = key
      return unreachable
    }
  }
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
      <Card className="gap-0 py-0 shadow-none">
        <Tabs value={kind} onValueChange={(v) => setKind(v as BenefitUseKind)} className="gap-0">
          <TabsList variant="line" aria-label="Benefit history" className="w-full justify-start gap-5 border-b px-4 sm:px-5">
            {HISTORY_TABS.map((t) => (
              <TabsTrigger key={t.kind} value={t.kind} className="flex-none px-0 py-3.5 text-[13px]">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {HISTORY_TABS.map((t) => (
            <TabsContent key={t.kind} value={t.kind}>
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
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </section>
  )
}
