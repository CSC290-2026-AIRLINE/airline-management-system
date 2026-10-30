import { useCallback } from 'react'
import type { BenefitKind, BenefitUse, MemberSummary, TierInfo } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { BENEFIT_NAMES, benefitLines, type BenefitKey } from '../benefits'
import { formatDate, formatMiles, formatTableDate } from '../format'
import { useLoad } from '../use-load'
import { cx, ui } from './labels'
import { Loaded, LoyaltyLayout } from './LoyaltyLayout'
import { TierArt, TierPill } from './parts'
import { NotMember } from './StatementPage'

const HINTS: Record<BenefitKey, string> = {
  lounge: 'Show your member number at the lounge desk. Needs a ticket for a flight leaving within 4 hours.',
  baggage: 'Added to the free allowance of your fare.',
  checkIn: 'Use the priority lane at the airport.',
  boarding: 'Board before other passengers.',
  upgrade: 'One cabin up on flights paid in cash, when seats are free.',
  insurance: 'Basic cover on each booking.',
}

const USE_LABEL: Record<BenefitKind, string> = { lounge: 'Lounge visit', insurance: 'Insurance', upgrade: 'Upgrade' }

// C09 My Benefits: what the member's tier gives, the next tier, and the benefits already used.
export function BenefitsPage() {
  const api = useLoyaltyApi()
  const load = useCallback(() => Promise.all([api.getMember(), api.getTiers(), api.getBenefitUses()]), [api])
  const [state, reload] = useLoad(load)

  return (
    <LoyaltyLayout title="My benefits" subtitle="What your tier gives you, and what you have used.">
      <Loaded state={state} retry={reload}>
        {([member, tiers, uses]) => (member ? <Benefits member={member} tiers={tiers} uses={uses} /> : <NotMember />)}
      </Loaded>
    </LoyaltyLayout>
  )
}

function Benefits({ member, tiers, uses }: { member: MemberSummary; tiers: TierInfo[]; uses: BenefitUse[] }) {
  const tier = tiers.find((t) => t.code === member.tier?.code)
  const next = tiers.find((t) => t.code === member.nextTier?.code)
  const lines = tier ? benefitLines(tier, tiers) : null

  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        {/* On a phone and tablet the card comes first, as in M1. */}
        <aside className="flex flex-col gap-5 sm:flex-row sm:items-start lg:order-2 lg:flex-col">
          <TierArt code={member.tier?.code ?? null} name={member.tier?.name ?? 'Member'} />
          {next && member.nextTier && (
            <div className="flex flex-col gap-2 sm:pt-0 lg:border-t lg:border-line lg:pt-5">
              <h2 className="text-base font-bold">Reach {next.name}</h2>
              <p className={ui.small}>{nextTierGains(next, tier)}</p>
              <strong className="text-[13px]">
                {formatMiles(member.nextTier.milesToGo)} more miles or {member.nextTier.flightsToGo} more flights
              </strong>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          <div className="flex flex-col gap-2 border-b border-line pb-4">
            <div className="flex items-center gap-2">
              <span className={ui.caps}>Your tier</span>
              {member.tier ? (
                <TierPill code={member.tier.code} name={member.tier.name} />
              ) : (
                <span className={cx(ui.pill, 'bg-[#eef0f3] text-[#5c6678]')}>No tier</span>
              )}
            </div>
            <h2 className="text-xl font-extrabold">
              {member.tier ? `${member.tier.name} until ${formatDate(member.tier.expiresAt)}.` : 'No tier yet.'}
            </h2>
          </div>

          <section aria-labelledby="your-benefits">
            <h2 id="your-benefits" className="mb-1 text-lg font-extrabold">
              Your benefits
            </h2>
            <div className="flex flex-col">
              {(Object.keys(BENEFIT_NAMES) as BenefitKey[]).map((key) => {
                const line = lines?.find((l) => l.key === key)
                const value = !line || !line.included ? 'No' : (benefitValue(line.key, line.value, tier) ?? 'Yes')
                return (
                  <div key={key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-3.5">
                    <div className="min-w-0 flex-1 basis-56">
                      <h3 className="text-[15px] font-semibold">{BENEFIT_NAMES[key]}</h3>
                      <span className={ui.small}>{HINTS[key]}</span>
                    </div>
                    <span className={cx('sm:whitespace-nowrap', value === 'No' ? 'font-normal text-muted' : 'font-bold')}>{value}</span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      <section className={ui.section} aria-labelledby="used">
        <h2 id="used" className="text-lg font-extrabold">
          Benefits used
        </h2>
        {uses.length === 0 ? (
          <div className={ui.empty}>
            <strong>No benefits used yet</strong>
            <span className={ui.small}>Lounge visits, upgrades and insurance show here once you use them.</span>
          </div>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  {['Benefit', 'Flight', 'Date', 'Detail'].map((h) => (
                    <th key={h} className={ui.th} scope="col">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uses.map((u) => (
                  <tr key={u.id}>
                    <td className={ui.td}>
                      <span className={cx(ui.pill, 'bg-[#eef0f3] text-[#5c6678]')}>{USE_LABEL[u.kind]}</span>
                    </td>
                    <td className={ui.td}>
                      <div>{u.route}</div>
                      <div className={ui.small}>{u.flightNumber}</div>
                    </td>
                    <td className={cx(ui.td, 'whitespace-nowrap')}>{formatTableDate(u.usedAt)}</td>
                    <td className={ui.td}>{u.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className={ui.small}>
        Upgrades are given automatically within 24 hours of departure when a higher cabin has unsold seats. Insurance is a record on your
        booking only. No real insurer is contacted.
      </p>
    </>
  )
}

function benefitValue(key: BenefitKey, value: string | null, tier: TierInfo | undefined) {
  if (key === 'upgrade' && value) return `Yes, ${value.charAt(0).toLowerCase()}${value.slice(1)}`
  if (key === 'insurance' && tier?.benefits.insurance.kind === 'member_price') {
    return `THB ${tier.benefits.insurance.priceThb} at member price`
  }
  return value
}

// e.g. "Adds a lounge guest, +10 kg baggage, priority check-in and boarding, and travel insurance included."
function nextTierGains(next: TierInfo, current: TierInfo | undefined) {
  const n = next.benefits
  const c = current?.benefits
  const gains: string[] = []
  if (n.loungeGuests !== null && (c?.loungeGuests ?? null) === null) gains.push('lounge access')
  else if (n.loungeGuests !== null && c && c.loungeGuests !== null && n.loungeGuests > c.loungeGuests) gains.push('a lounge guest')
  if (n.bonusBaggageKg > (c?.bonusBaggageKg ?? 0)) gains.push(`+${n.bonusBaggageKg} kg baggage`)
  if (n.priorityCheckIn && !c?.priorityCheckIn && n.priorityBoarding && !c?.priorityBoarding) gains.push('priority check-in and boarding')
  if (n.insurance.kind === 'included' && c?.insurance.kind !== 'included') gains.push('travel insurance included')
  else if (n.insurance.kind === 'member_price' && !c) gains.push('travel insurance at the member price')
  if (gains.length === 0) return `See ${next.name} in the tier table.`
  const text = gains.length > 1 ? `${gains.slice(0, -1).join(', ')}, and ${gains[gains.length - 1]}` : gains[0]
  return `Adds ${text}.`
}
