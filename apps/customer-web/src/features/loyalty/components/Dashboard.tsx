import { Link } from '@tanstack/react-router'
import type { MemberSummary, StatementRow, TierInfo } from '../api/types'
import { BENEFIT_NAMES, benefitLines, loungeLabel } from '../benefits'
import { formatDate, formatMiles, formatTableDate } from '../format'
import { LoyaltyLayout } from './LoyaltyLayout'
import { Icon, MilesCell, SearchFlightsLink, TierPill, TypePill } from './parts'
import { TIER_ART } from './labels'
import styles from './loyalty.module.css'

// C03 Dashboard and C04 for a new member with no tier.
export function Dashboard({ member, tiers, activity }: { member: MemberSummary; tiers: TierInfo[]; activity: StatementRow[] }) {
  const expiring = member.expiringSoon[0]
  return (
    <LoyaltyLayout title="Membership" subtitle="Your miles, tier and recent activity.">
      {expiring && (
        <div className={styles.notice} role="status">
          <span className={styles.iconBox} style={{ background: '#ffe3b2' }}>
            <Icon name="clock" />
          </span>
          <div>
            <strong style={{ fontSize: 15 }}>
              {formatMiles(expiring.miles)} miles expire on {formatDate(expiring.expiresOn)}.
            </strong>
            <span style={{ fontSize: 13 }}>Fly or spend them before then. We sent you a reminder.</span>
          </div>
          <SearchFlightsLink label="Find award seats" />
        </div>
      )}

      <MemberCard member={member} />

      <div className={styles.columns}>
        <div className={styles.stack}>
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
    <section className={styles.memberCard} aria-label="Your Flython Miles card">
      <div className={styles.cardTop}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className={styles.brand}>FLYTHON MILES</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 className={styles.cardName} style={{ color: '#fff' }}>
              {member.name}
            </h2>
            {member.tier ? <TierPill code={member.tier.code} name={member.tier.name} /> : <span className={styles.pill}>Member</span>}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.8)' }}>
            {member.tier ? `${member.tier.name} until ${formatDate(member.tier.expiresAt)}.` : 'No tier yet.'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span className={styles.caps}>Member number</span>
          <span className={styles.cardNumber}>{member.memberNumber}</span>
        </div>
      </div>
      <div className={styles.cardBottom}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className={styles.caps}>Miles balance</span>
          <span className={styles.balance}>{formatMiles(member.milesBalance)} miles</span>
        </div>
        <div className={styles.actions}>
          <SearchFlightsLink label="Spend miles" />
          <Link to="/loyalty/statement" className={styles.buttonGhost}>
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
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>You are at our highest tier</h2>
        <p className={styles.muted}>Keep flying to renew it before it expires.</p>
      </section>
    )
  }
  const fresh = next.milesToGo === next.minMiles && next.flightsToGo === next.minFlights
  return (
    <section className={styles.section} aria-labelledby="next-tier" style={{ gap: 18 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span className={styles.iconBox} style={{ background: '#e3f1f5', width: 44, height: 44, color: '#0e7490' }}>
          <Icon name="trend" size={22} />
        </span>
        <div>
          <h2 id="next-tier" className={styles.sectionTitle}>
            Next tier · {next.name}
          </h2>
          <p>
            {fresh
              ? `Earn ${formatMiles(next.minMiles)} miles or fly ${next.minFlights} flights in the last 12 months to reach ${next.name}.`
              : `Earn ${formatMiles(next.milesToGo)} more miles or fly ${next.flightsToGo} more flights in the last 12 months to reach ${next.name}.`}
          </p>
        </div>
      </div>
      <div className={styles.progressGrid}>
        <Progress label="Miles earned" have={next.minMiles - next.milesToGo} need={next.minMiles} />
        <Progress label="Flights flown" have={next.minFlights - next.flightsToGo} need={next.minFlights} />
      </div>
      <p className={styles.small}>
        You qualify on miles or on flights, whichever you reach first.
        {!fresh && ' Only seats you flew yourself count. Miles from seats you booked for others go to your balance only.'}
      </p>
    </section>
  )
}

function Progress({ label, have, need }: { label: string; have: number; need: number }) {
  const pct = Math.min(100, Math.round((have / need) * 100))
  return (
    <div className={styles.progressBox}>
      <div className={styles.rowBetween}>
        <span className={styles.muted} style={{ fontSize: 13, fontWeight: 600 }}>
          {label}
        </span>
        <span className={styles.strong} style={{ fontSize: 15 }}>
          {formatMiles(have)} / {formatMiles(need)}
        </span>
      </div>
      <div className={styles.meter} role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function LatestActivity({ rows }: { rows: StatementRow[] }) {
  return (
    <section className={styles.section} aria-labelledby="latest">
      <div className={styles.rowBetween}>
        <h2 id="latest" className={styles.sectionTitle}>
          Latest activity
        </h2>
        {rows.length > 0 && (
          <Link to="/loyalty/statement" className={styles.link}>
            View full statement →
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <div className={styles.empty}>
          <strong>No activity yet</strong>
          <span className={styles.small}>Miles are added after you fly. Book a flight to start earning.</span>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Type</th>
                <th scope="col" className={styles.num}>
                  Miles
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.seq}>
                  <td className={styles.cellDate}>{formatTableDate(row.occurredAt)}</td>
                  <td>
                    <div className={styles.cellTitle}>{row.title}</div>
                    <div className={styles.small}>{row.detail}</div>
                  </td>
                  <td>
                    <TypePill type={row.type} />
                  </td>
                  <MilesCell miles={row.miles} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function BenefitsCard({ member, tiers }: { member: MemberSummary; tiers: TierInfo[] }) {
  const tier = tiers.find((t) => t.code === member.tier?.code)
  const target = tier ?? tiers.find((t) => t.code === member.nextTier?.code)
  return (
    <section className={styles.benefitCard} aria-labelledby="benefits">
      <div className={`${styles.benefitBand} ${tier ? TIER_ART[tier.code] : styles.tierNone}`}>
        <span className={styles.iconBox}>
          <Icon name="star" color="#0a1424" />
        </span>
        <h2 id="benefits" style={{ fontSize: 17, color: 'inherit' }}>
          {tier ? `Your ${tier.name} benefits` : 'No tier benefits yet'}
        </h2>
      </div>
      <div className={styles.benefitBody}>
        {target && <p>{tier ? benefitSummary(tier, tiers) : `Reach ${target.name} for ${benefitSummary(target, tiers, true)}.`}</p>}
        <Link to="/loyalty/benefits" className={styles.link}>
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
