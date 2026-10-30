import { Link } from '@tanstack/react-router'
import type { MemberSummary, StatementRow, TierInfo } from '../api/types'
import { BENEFIT_NAMES, benefitLines, loungeLabel } from '../benefits'
import { formatDate, formatMiles, formatSignedMiles, formatTableDate } from '../format'
import { cx, NO_TIER_ART, TIER_ART, ui } from './labels'
import { LoyaltyLayout } from './LoyaltyLayout'
import { Icon, MilesCell, SearchFlightsLink, TierPill, TypePill } from './parts'

// C03 Dashboard and C04 for a new member with no tier; M1/M2 on a phone.
export function Dashboard({ member, tiers, activity }: { member: MemberSummary; tiers: TierInfo[]; activity: StatementRow[] }) {
  const expiring = member.expiringSoon[0]
  return (
    <LoyaltyLayout title="Membership" subtitle="Your miles, tier and recent activity.">
      {expiring && (
        <div
          className="flex flex-wrap items-center gap-3.5 rounded-md border border-[#f5d699] bg-[#fff3db] px-4 py-4 text-warn sm:px-5"
          role="status"
        >
          <span className={cx(ui.iconBox, 'bg-[#ffe3b2]')}>
            <Icon name="clock" />
          </span>
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
            <strong className="text-[15px]">
              {formatMiles(expiring.miles)} miles expire on {formatDate(expiring.expiresOn)}.
            </strong>
            <span className="text-[13px]">Fly or spend them before then. We sent you a reminder.</span>
          </div>
          <SearchFlightsLink label="Find award seats" className={cx(ui.button, 'w-full sm:w-auto')} />
        </div>
      )}

      <MemberCard member={member} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <NextTier member={member} />
          <LatestActivity rows={activity} />
        </div>
        <BenefitsCard member={member} tiers={tiers} />
      </div>
    </LoyaltyLayout>
  )
}

function MemberCard({ member }: { member: MemberSummary }) {
  return (
    <section
      className="flex flex-col gap-5 rounded-lg bg-[linear-gradient(90deg,rgba(16,37,68,0.97),rgba(16,37,68,0.88)_60%,rgba(14,116,144,0.75))] p-5 text-white sm:gap-7 sm:px-9 sm:py-8"
      aria-label="Your Flython Miles card"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-black tracking-[0.14em] text-white/85">FLYTHON MILES</span>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[22px] font-extrabold sm:text-3xl" style={{ color: '#fff' }}>
              {member.name}
            </h2>
            {member.tier ? (
              <TierPill code={member.tier.code} name={member.tier.name} />
            ) : (
              <span className={cx(ui.pill, 'bg-white/20 text-white')}>Member</span>
            )}
          </div>
          <span className="text-white/80">
            {member.tier ? `${member.tier.name} until ${formatDate(member.tier.expiresAt)}.` : 'No tier yet.'}
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-white/70">MEMBER NUMBER</span>
          <span className="text-lg font-extrabold tracking-[0.06em] sm:text-[22px]">{member.memberNumber}</span>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-white/70">MILES BALANCE</span>
          <span className="text-[34px] leading-tight font-black sm:text-[44px] lg:text-[52px]">
            {formatMiles(member.milesBalance)} miles
          </span>
        </div>
        <div className="flex gap-3 *:flex-1 sm:*:flex-none">
          <SearchFlightsLink label="Spend miles" />
          <Link to="/loyalty/statement" className={ui.buttonGhost}>
            View statement
          </Link>
        </div>
      </div>
    </section>
  )
}

function NextTier({ member }: { member: MemberSummary }) {
  const next = member.nextTier
  if (!next) {
    return (
      <section className={ui.section}>
        <h2 className={ui.sectionTitle}>You are at our highest tier</h2>
        <p className="text-muted">Keep flying to renew it before it expires.</p>
      </section>
    )
  }
  const fresh = next.milesToGo === next.minMiles && next.flightsToGo === next.minFlights
  return (
    <section className={cx(ui.section, 'gap-[18px]')} aria-labelledby="next-tier">
      <div className="flex items-center gap-3.5">
        <span className={cx(ui.iconBox, 'size-11 bg-[#e3f1f5] text-teal')}>
          <Icon name="trend" size={22} />
        </span>
        <div>
          <h2 id="next-tier" className={ui.sectionTitle}>
            Next tier · {next.name}
          </h2>
          <p>
            {fresh
              ? `Earn ${formatMiles(next.minMiles)} miles or fly ${next.minFlights} flights in the last 12 months to reach ${next.name}.`
              : `Earn ${formatMiles(next.milesToGo)} more miles or fly ${next.flightsToGo} more flights in the last 12 months to reach ${next.name}.`}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <Progress label="Miles earned" have={next.minMiles - next.milesToGo} need={next.minMiles} />
        <Progress label="Flights flown" have={next.minFlights - next.flightsToGo} need={next.minFlights} />
      </div>
      <p className={ui.small}>
        You qualify on miles or on flights, whichever you reach first.
        {!fresh && ' Only seats you flew yourself count. Miles from seats you booked for others go to your balance only.'}
      </p>
    </section>
  )
}

function Progress({ label, have, need }: { label: string; have: number; need: number }) {
  const pct = Math.min(100, Math.round((have / need) * 100))
  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-soft px-[18px] py-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[13px] font-semibold text-muted">{label}</span>
        <span className="text-[15px] font-extrabold">
          {formatMiles(have)} / {formatMiles(need)}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-divider"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="block h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function LatestActivity({ rows }: { rows: StatementRow[] }) {
  return (
    <section className={ui.section} aria-labelledby="latest">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="latest" className={ui.sectionTitle}>
          Latest activity
        </h2>
        {rows.length > 0 && (
          <Link to="/loyalty/statement" className={ui.link}>
            View full statement →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <div className={ui.empty}>
          <strong>No activity yet</strong>
          <span className={ui.small}>Miles are added after you fly. Book a flight to start earning.</span>
        </div>
      ) : (
        <>
          {/* Phone: a list (M1); wider screens: the table (C03). */}
          <ul className="m-0 flex list-none flex-col p-0 sm:hidden">
            {rows.map((row) => (
              <li key={row.seq} className="flex items-center justify-between gap-3 border-b border-divider py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{row.title}</div>
                  <div className={ui.small}>
                    {formatDate(row.occurredAt)} · <TypePill type={row.type} />
                  </div>
                </div>
                <span className={cx('text-[15px] font-extrabold whitespace-nowrap', row.miles > 0 ? 'text-ok' : 'text-warn')}>
                  {formatSignedMiles(row.miles)}
                </span>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block">
            <table className={cx(ui.table, 'min-w-0')}>
              <thead>
                <tr>
                  <th className={ui.th} scope="col">
                    Date
                  </th>
                  <th className={ui.th} scope="col">
                    Description
                  </th>
                  <th className={ui.th} scope="col">
                    Type
                  </th>
                  <th className={cx(ui.th, ui.num)} scope="col">
                    Miles
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.seq}>
                    <td className={cx(ui.td, 'text-[13px] whitespace-nowrap text-muted')}>{formatTableDate(row.occurredAt)}</td>
                    <td className={ui.td}>
                      <div className="text-sm font-semibold">{row.title}</div>
                      <div className={ui.small}>{row.detail}</div>
                    </td>
                    <td className={ui.td}>
                      <TypePill type={row.type} />
                    </td>
                    <MilesCell miles={row.miles} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function BenefitsCard({ member, tiers }: { member: MemberSummary; tiers: TierInfo[] }) {
  const tier = tiers.find((t) => t.code === member.tier?.code)
  const target = tier ?? tiers.find((t) => t.code === member.nextTier?.code)
  return (
    <section className="border-t border-line pt-7" aria-labelledby="benefits">
      <div className={cx('flex items-center gap-3 px-[22px] py-5', tier ? TIER_ART[tier.code] : NO_TIER_ART)}>
        <span className={cx(ui.iconBox, 'bg-white')}>
          <Icon name="star" color="#0a1424" />
        </span>
        <h2 id="benefits" className="text-[17px] font-extrabold">
          {tier ? `Your ${tier.name} benefits` : 'No tier benefits yet'}
        </h2>
      </div>
      <div className="flex flex-col gap-3.5 px-[22px] pt-5 pb-[22px] leading-normal">
        {target && <p>{tier ? benefitSummary(tier, tiers) : `Reach ${target.name} for ${benefitSummary(target, tiers, true)}.`}</p>}
        <Link to="/loyalty/benefits" className={ui.link}>
          See all benefits →
        </Link>
      </div>
    </section>
  )
}

// e.g. "Lounge access (member only), +5 kg free baggage, and travel insurance at the member price."
function benefitSummary(tier: TierInfo, tiers: TierInfo[], short = false) {
  const lines = benefitLines(tier, tiers).filter((l) => l.included)
  const parts = lines.map((l) => {
    switch (l.key) {
      case 'lounge':
        return short ? 'lounge access' : `${BENEFIT_NAMES.lounge} (${loungeLabel(tier.benefits.loungeGuests).toLowerCase()})`
      case 'baggage':
        return `${l.value} free baggage`
      case 'insurance':
        return tier.benefits.insurance.kind === 'included' ? 'travel insurance included' : 'travel insurance at the member price'
      case 'upgrade':
        return short ? null : `complimentary upgrades (${l.value?.replace(/^A/, 'a').replace(/^F/, 'f')})`
      case 'checkIn':
      case 'boarding':
        return short ? null : BENEFIT_NAMES[l.key].toLowerCase()
      default: {
        const unreachable: never = l.key
        return unreachable
      }
    }
  })
  const words = parts.filter((p): p is string => p !== null)
  const text = words.length > 1 ? `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}` : (words[0] ?? '')
  return short ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}
