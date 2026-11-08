import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Clock, Pencil, PlaneTakeoff, Star, Ticket, Undo2, type LucideProps } from 'lucide-react'
import type { MemberSummary, StatementRow, TierInfo, TransactionType } from '../api/types'
import { benefitSummary, nextTierAdds } from '../benefits'
import { formatDate, formatMiles, toDateInput } from '../format'
import { LoyaltyLayout } from './LoyaltyLayout'
import { EmptyState, SearchFlightsLink, SignedMiles } from './parts'
import { cx, NO_TIER_ART, TIER_BAND, TYPE_LABEL, ui } from './ui'

// C03 Dashboard, C04 for a new member with no tier, and M1 on a phone.
export function Dashboard({ member, tiers, activity }: { member: MemberSummary; tiers: TierInfo[]; activity: StatementRow[] }) {
  return (
    <LoyaltyLayout subtitle="Your miles, tier and recent activity." member={member}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
        <MemberCard member={member} />
        <TierProgress member={member} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
        <Updates member={member} />
        <BenefitsCard member={member} tiers={tiers} />
      </div>
      <LatestActivity rows={activity.slice(0, 5)} />
    </LoyaltyLayout>
  )
}

function MemberCard({ member }: { member: MemberSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Your FlySmiles card"
        className="rounded-2xl bg-[linear-gradient(135deg,#f7dc8a,#a87b1e_45%,#f3d27a_70%,#9c7015)] p-[5px] shadow-[0_10px_30px_rgba(169,123,30,0.25)]"
      >
        <div className="flex h-full min-h-[220px] flex-col justify-between gap-6 rounded-xl bg-[radial-gradient(circle_at_30%_20%,#1d3561,#13264a_60%)] p-5 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-[0.14em] text-white/85 sm:text-[11px]">
                FLYSMILES · {member.tier ? `${member.tier.name.toUpperCase()} MEMBER` : 'MEMBER'}
              </span>
              <span className="text-xl font-bold text-[#f3d27a] sm:text-[28px]">{member.name}</span>
            </div>
            <dl className="m-0 flex flex-col items-end gap-3 text-right">
              <div>
                <dt className="text-[10px] tracking-[0.08em] text-white/75 uppercase">Member number</dt>
                <dd className="m-0 text-[13px] font-bold tracking-[0.06em] sm:text-lg">{member.memberNumber}</dd>
              </div>
              {member.tier && (
                <div>
                  <dt className="text-[10px] tracking-[0.08em] text-white/75 uppercase">Valid until</dt>
                  <dd className="m-0 text-[13px] font-bold sm:text-lg">{formatDate(member.tier.expiresAt)}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.08em] text-white/75 uppercase">Miles balance</span>
            <span className="font-mono text-[30px] leading-tight font-bold sm:text-[44px]">{formatMiles(member.milesBalance)} miles</span>
          </div>
          <div className="hidden gap-3 sm:flex">
            <SearchFlightsLink label="Spend miles" className={ui.buttonOnDark} />
            <Link to="/loyalty/statement" className={ui.buttonGhostOnDark}>
              View statement
            </Link>
          </div>
        </div>
      </section>
      {/* On a phone the actions sit under the card (M1). */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <SearchFlightsLink label="Spend miles" className={ui.buttonPrimary} />
        <Link to="/loyalty/statement" className={ui.button}>
          Statement
        </Link>
      </div>
    </div>
  )
}

function TierProgress({ member }: { member: MemberSummary }) {
  const next = member.nextTier
  const title = member.tier
    ? next
      ? `${member.tier.name} to ${next.name}`
      : `${member.tier.name} · our highest tier`
    : `No tier yet · next ${next?.name ?? ''}`
  return (
    <section className={cx(ui.card, 'flex flex-col gap-4 p-5 sm:p-6')} aria-labelledby="tier-progress">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[11px] font-bold tracking-[0.1em] text-link">YOUR TIER PROGRESS</span>
          {member.tier && <span className="text-[11px] text-muted">Valid until {formatDate(member.tier.expiresAt)}</span>}
        </div>
        <h2 id="tier-progress" className="text-[22px] font-semibold sm:text-2xl">
          {title}
        </h2>
      </div>
      {next ? (
        <>
          <Progress
            label="Tier miles · flown by you"
            have={member.tierMiles}
            need={next.minMiles}
            note={`${formatMiles(Math.max(0, next.minMiles - member.tierMiles))} tier miles to ${next.name}`}
            bar="bg-gold"
          />
          <div className="flex items-center gap-3 text-[10px] text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            OR
            <span className="h-px flex-1 bg-line" />
          </div>
          <Progress
            label="Eligible flights"
            have={member.tierFlights}
            need={next.minFlights}
            note={`${Math.max(0, next.minFlights - member.tierFlights)} eligible flights to ${next.name}`}
            bar="bg-link"
          />
          <p className="text-[11px] text-muted">Either goal in the last 12 months qualifies you. Only your flown seats count.</p>
        </>
      ) : (
        <p className="text-[13px] text-muted">Keep flying to renew your tier before it expires.</p>
      )}
    </section>
  )
}

function Progress({ label, have, need, note, bar }: { label: string; have: number; need: number; note: string; bar: string }) {
  const pct = Math.min(100, Math.round((have / need) * 100))
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="text-xl font-semibold tabular-nums">
          {formatMiles(have)} / {formatMiles(need)}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-divider"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={cx('block h-full rounded-full', bar)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted">{note}</span>
    </div>
  )
}

function Updates({ member }: { member: MemberSummary }) {
  const renewedToday = member.tier && toDateInput(member.tier.qualifiedAt) === toDateInput(member.asOf)
  const expiring = member.expiringSoon[0]
  return (
    <section className={cx(ui.card, 'flex flex-col gap-5 p-5 sm:p-6')} aria-labelledby="updates">
      <h2 id="updates" className="text-[15px] font-semibold">
        Updates
      </h2>
      {!renewedToday && !expiring ? (
        <p className="text-[13px] text-muted">Nothing new. Miles you earn show here after each flight.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-6 p-0 sm:pl-3">
          {renewedToday && member.tier && (
            <li className="flex gap-3">
              <span className="grid size-7 flex-none place-items-center rounded-full bg-[#e0faeb] text-ok" aria-hidden="true">
                <Check size={14} strokeWidth={3} />
              </span>
              <div className="flex flex-col">
                <strong className="text-[13px] font-semibold text-ok">{member.tier.name} renewed today</strong>
                <span className="text-xs text-muted">
                  Your last flight kept you {member.tier.name} until {formatDate(member.tier.expiresAt)}.
                </span>
              </div>
            </li>
          )}
          {expiring && (
            <li className="flex gap-3">
              <span className="grid size-7 flex-none place-items-center rounded-full bg-[#fff3db] text-warn" aria-hidden="true">
                <Clock size={14} strokeWidth={2.5} />
              </span>
              <div className="flex flex-col">
                <strong className="text-[13px] font-semibold">
                  {formatMiles(expiring.miles)} miles expire on {formatDate(expiring.expiresOn)}.
                </strong>
                <span className="text-xs text-muted">Fly or spend them before then.</span>
              </div>
            </li>
          )}
        </ul>
      )}
      <SearchFlightsLink label="Find award seats →" className={cx(ui.link, 'mt-auto self-end')} />
    </section>
  )
}

function BenefitsCard({ member, tiers }: { member: MemberSummary; tiers: TierInfo[] }) {
  const tier = tiers.find((t) => t.code === member.tier?.code) ?? null
  const next = tiers.find((t) => t.code === member.nextTier?.code) ?? null
  return (
    <section className={cx(ui.card, 'flex flex-col gap-4 p-5 sm:p-6')} aria-labelledby="benefits">
      <div className={cx('flex items-center gap-3 rounded-lg px-5 py-4', tier ? TIER_BAND[tier.code] : NO_TIER_ART)}>
        <span className="grid size-9 place-items-center rounded-md bg-white text-ink" aria-hidden="true">
          <Star size={18} />
        </span>
        <h2 id="benefits" className="text-base font-bold">
          {tier ? `Your ${tier.name} benefits` : 'No tier benefits yet'}
        </h2>
      </div>
      <p className="px-1 text-[13px] leading-relaxed sm:px-5">
        {tier ? benefitSummary(tier, tiers) : next ? `Reach ${next.name} to unlock benefits. ${nextTierAdds(null, next, tiers)}` : ''}
      </p>
      <Link to="/loyalty/benefits" className={cx(ui.link, 'px-1 sm:px-5')}>
        See all benefits <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  )
}

const ACTIVITY_ICON: Record<TransactionType, { icon: ComponentType<LucideProps>; tone: string }> = {
  earn: { icon: PlaneTakeoff, tone: 'bg-[#e8eef7] text-link' },
  redeem: { icon: Ticket, tone: 'bg-[#fff3db] text-warn' },
  redeem_reversal: { icon: Undo2, tone: 'bg-[#fff3db] text-warn' },
  expire: { icon: Clock, tone: 'bg-[#eef0f3] text-[#5c6678]' },
  adjust: { icon: Pencil, tone: 'bg-transparent text-[#5c6678]' },
}

function LatestActivity({ rows }: { rows: StatementRow[] }) {
  return (
    <section className={cx(ui.card, 'flex flex-col p-5 sm:p-6')} aria-labelledby="latest">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <h2 id="latest" className={ui.cardTitle}>
          Latest activity
        </h2>
        {rows.length > 0 && (
          <Link to="/loyalty/statement" className={ui.link}>
            View full statement <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No activity yet"
          body="Miles are added after you fly. Book a flight to start earning."
          action={<SearchFlightsLink label="Book a flight" />}
        />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => {
            const { icon: Icon, tone } = ACTIVITY_ICON[r.type]
            return (
              <li key={r.seq} className="flex items-center gap-3 border-b border-divider py-3 last:border-0">
                <span className={cx('grid size-9 flex-none place-items-center rounded-full', tone)} aria-hidden="true">
                  <Icon size={16} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-medium">{r.title}</span>
                  <span className="text-[11px] text-muted">
                    {formatDate(r.occurredAt)} · {r.detail}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <SignedMiles type={r.type} miles={r.miles} tone="text-link" className="text-[15px]" />
                  <span className="text-[10px] text-muted">{TYPE_LABEL[r.type]}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
