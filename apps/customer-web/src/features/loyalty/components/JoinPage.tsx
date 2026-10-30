import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import type { LoyaltyApi, MemberSummary, TierInfo } from '../api/types'
import { BENEFIT_NAMES, benefitLines, benefitSentence, type BenefitKey } from '../benefits'
import { formatMiles } from '../format'
import { cx, FLIGHT_SEARCH_PATH, GUTTER, PAGE, TIER_ART, ui } from './labels'
import { Icon } from './parts'

const FEATURES = [
  { icon: 'plane', title: 'Earn on every flight', text: 'Miles = route distance × your fare rate, added after you fly.' },
  { icon: 'users', title: 'Earn for your family', text: 'Book for family or friends and the miles for every seat go to you.' },
  { icon: 'ticket', title: 'Spend on award seats', text: 'Pay the fare with miles on selected flights. Taxes go on your card.' },
  { icon: 'star', title: 'Unlock tier benefits', text: 'Lounge access, extra bags, priority lanes, upgrades and insurance.' },
] as const

// BKK → HKG at each fare rate, as on the design.
const EXAMPLE_KM = 1722
const EXAMPLE_RATES = [
  { label: 'Discount × 0.50', rate: 0.5 },
  { label: 'Full fare × 1.00', rate: 1 },
  { label: 'Business × 1.50', rate: 1.5 },
]

const HERO = cx(
  'flex flex-col items-start justify-between gap-8 py-9 text-white sm:py-12 md:flex-row md:items-center lg:py-16',
  'bg-[linear-gradient(100deg,#102544_0%,#1a2f52_45%,#3f6f8f_80%,#8fb7c9_100%)]',
  GUTTER,
)
const BAND_TITLE = 'text-2xl font-extrabold sm:text-[30px]'

// C01 Join and C01b with the terms ticked.
export function JoinPage({ api, tiers, onJoined }: { api: LoyaltyApi; tiers: TierInfo[]; onJoined: (m: MemberSummary) => void }) {
  const { user } = useUser()
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'you'
  const firstName = user?.firstName ?? name
  const email = user?.primaryEmailAddress?.emailAddress
  const [agreed, setAgreed] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async () => {
    setJoining(true)
    setError(null)
    try {
      onJoined(await api.join(name))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Please try again.')
      setJoining(false)
    }
  }

  return (
    <main className={PAGE} data-full-bleed>
      <section className={HERO}>
        <div className="flex max-w-[520px] flex-col gap-4">
          <span className="text-[11px] font-bold tracking-[0.12em] text-[#f5b544]">FLYTHON MILES · FREE TO JOIN</span>
          <h1 className="text-[32px] leading-tight font-extrabold sm:text-[40px] lg:text-5xl" style={{ color: '#fff' }}>
            Join Flython Miles
          </h1>
          <p className="text-[15px] leading-normal text-white/85">
            Join free and earn miles on every flight you book, for you and everyone you book for. Spend them on award seats and unlock tier
            benefits.
          </p>
          <a href="#join" className={cx(ui.button, 'self-start')}>
            Join for free
          </a>
        </div>
      </section>

      <section
        className={cx('grid grid-cols-1 gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:py-12', GUTTER)}
        aria-label="What you get"
      >
        {FEATURES.map((f) => (
          <div key={f.title} className="flex flex-col gap-2 lg:border-l lg:border-line lg:px-5 lg:first:border-l-0 lg:first:pl-0">
            <Icon name={f.icon} size={22} color="#1f408c" />
            <h3 className="text-[15px] font-bold">{f.title}</h3>
            <p className={ui.small}>{f.text}</p>
          </div>
        ))}
      </section>

      <section className={cx('flex flex-col gap-6 bg-band py-8 lg:py-12', GUTTER)} aria-labelledby="reach">
        <div>
          <h2 id="reach" className={BAND_TITLE}>
            Reach a tier
          </h2>
          <p className="mt-1 text-muted">
            Qualify on miles or on flights in the last 12 months, whichever comes first. A tier lasts 12 months.
          </p>
        </div>
        <TierComparison tiers={tiers} />
      </section>

      <section className={cx('grid grid-cols-1 items-start gap-6 py-8 md:grid-cols-2 md:gap-12 lg:py-12', GUTTER)} aria-labelledby="earn">
        <div>
          <h2 id="earn" className={BAND_TITLE}>
            How miles are earned
          </h2>
          <p className="mt-3 text-muted">
            Miles = route distance in km × your fare rate. A cheaper ticket earns less than a full fare on the same route.
          </p>
        </div>
        <div>
          <div className="flex items-baseline gap-2.5 border-b border-line pb-3 text-lg font-extrabold">
            BKK <Icon name="plane" size={18} color="#0e7490" /> HKG
            <span className={ui.small}>· {formatMiles(EXAMPLE_KM)} km</span>
          </div>
          <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-3 sm:gap-0">
            {EXAMPLE_RATES.map((r) => (
              <div key={r.label} className="sm:border-l sm:border-line sm:px-3 sm:first:border-l-0 sm:first:pl-0">
                <span className={ui.small}>{r.label}</span>
                <strong className="block text-lg font-extrabold text-teal">{formatMiles(Math.round(EXAMPLE_KM * r.rate))} miles</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="join"
        className={cx(
          'grid grid-cols-1 items-center gap-12 bg-[linear-gradient(100deg,#0b1424,#13284a)] py-10 text-white md:grid-cols-2 lg:py-14',
          GUTTER,
        )}
        aria-labelledby="ready"
      >
        <div className="relative hidden h-[220px] md:block" aria-hidden="true">
          {(
            [
              ['platinum', 'left-0 top-5 -rotate-[8deg]'],
              ['silver', 'left-[150px] top-0 -rotate-[4deg]'],
              ['gold', 'left-20 top-[100px] rotate-3'],
            ] as const
          ).map(([code, place]) => (
            <div
              key={code}
              className={cx(
                'absolute flex aspect-[1.6] w-[200px] flex-col justify-between rounded-[10px] p-4 shadow-xl',
                TIER_ART[code],
                place,
              )}
            >
              <span className="text-[9px] font-black tracking-[0.14em]">FLYTHON MILES</span>
              <span className="text-[13px] font-extrabold uppercase tracking-[0.12em]">{code}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3.5">
          <h2 id="ready" className="text-[22px] font-extrabold sm:text-[28px]" style={{ color: '#fff' }}>
            Ready to join, {firstName}?
          </h2>
          <p className="text-white/85">
            Joining as {name}
            {email && email !== name ? ` · ${email}` : ''}. You get a member number straight away.
          </p>
          <ul className="m-0 pl-[18px] text-xs leading-[1.8] text-white/80">
            <li>Miles go to the member who books, for everyone on the booking.</li>
            <li>Miles expire 36 months after the flight. We remind you 30 days before.</li>
          </ul>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-[18px]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />I agree to the
            Flython Miles terms.
          </label>
          {error && (
            <p className="rounded-md border border-danger bg-white px-4 py-3 text-danger" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className={cx(agreed ? ui.button : ui.buttonPrimary, 'w-full sm:w-auto sm:self-start')}
            onClick={() => void join()}
            disabled={!agreed || joining}
          >
            {joining ? 'Joining…' : 'Join Flython Miles'}
          </button>
          {!agreed && <p className="text-xs text-white/70">Tick the box to agree to the terms before you join.</p>}
        </div>
      </section>
    </main>
  )
}

const ROWS: BenefitKey[] = ['lounge', 'baggage', 'checkIn', 'boarding', 'upgrade', 'insurance']

function TierComparison({ tiers }: { tiers: TierInfo[] }) {
  const lines = tiers.map((t) => benefitLines(t, tiers))
  return (
    <div className="-mx-4 overflow-x-auto bg-white px-3 py-3 sm:mx-0 sm:px-6 sm:py-4">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr>
            <td className="border-b-2 border-navy" />
            {tiers.map((t) => (
              <th key={t.code} scope="col" className="border-b-2 border-navy pb-4 text-center text-xs">
                <div
                  className={cx(
                    'mx-auto mb-2 flex aspect-[1.6] w-20 flex-col justify-between rounded-md p-2 text-[7px] font-extrabold uppercase tracking-[0.1em] sm:w-24',
                    TIER_ART[t.code],
                  )}
                  aria-hidden="true"
                >
                  <span>Flython Miles</span>
                  <span>{t.name}</span>
                </div>
                <div className="font-extrabold tracking-[0.12em]">{t.name.toUpperCase()}</div>
                <div className="font-normal text-muted">
                  {formatMiles(t.minMiles)} miles or {t.minFlights} flights
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((key, row) => (
            <tr key={key}>
              <th scope="row" className="border-b border-divider py-3.5 pr-3 text-left text-[13px] font-semibold">
                {BENEFIT_NAMES[key]}
              </th>
              {lines.map((tierLines, i) => {
                const line = tierLines[row]
                return (
                  <td key={tiers[i].code} className="border-b border-divider py-3 text-center text-xs">
                    {line.included ? (
                      <>
                        <span className="mx-auto mb-1 block w-fit text-navy">
                          <Icon name="check" size={16} />
                        </span>
                        {line.value ?? <span className="sr-only">Included</span>}
                      </>
                    ) : (
                      <span className="text-muted" aria-label="Not included">
                        —
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// C02 Welcome, shown once right after joining.
export function WelcomePage({ member, tiers, onContinue }: { member: MemberSummary; tiers: TierInfo[]; onContinue: () => void }) {
  const firstName = member.name.split(' ')[0]
  return (
    <main className={PAGE} data-full-bleed>
      <section className={HERO}>
        <div className="flex max-w-[520px] flex-col gap-4">
          <span className="self-start rounded-full bg-[#e0faeb] px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-ok">
            ✓ YOU’RE A MEMBER
          </span>
          <h1 className="text-[32px] leading-tight font-extrabold sm:text-[40px] lg:text-5xl" style={{ color: '#fff' }}>
            Welcome aboard, {firstName}.
          </h1>
          <p className="text-[15px] leading-normal text-white/85">
            Your member number is ready. You have 0 miles and no tier yet. Miles are added after each flight on a booking you made.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className={ui.button} onClick={onContinue}>
              Go to my membership
            </button>
            <Link to={FLIGHT_SEARCH_PATH} className="text-sm font-semibold text-white">
              Book a flight
            </Link>
          </div>
        </div>
        <div
          className="flex aspect-[1.6] w-[min(280px,100%)] flex-none -rotate-3 flex-col justify-between self-center rounded-xl bg-[linear-gradient(135deg,#0f5c74,#123a5c)] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.3)] md:-rotate-6"
          aria-label={`Member number ${member.memberNumber}`}
        >
          <span className="text-xs font-black tracking-[0.14em] text-white/85">FLYTHON MILES</span>
          <div className="flex flex-col items-start">
            <strong className="text-base font-extrabold uppercase tracking-[0.06em]">{member.name}</strong>
            <strong className="text-base font-extrabold tracking-[0.06em]">{member.memberNumber}</strong>
            <span className={cx(ui.pill, 'mt-1.5 bg-white/20 text-white')}>MEMBER</span>
          </div>
        </div>
      </section>

      <section className={cx('flex flex-col gap-6 bg-band py-8 lg:py-12', GUTTER)} aria-labelledby="reach">
        <div>
          <h2 id="reach" className={BAND_TITLE}>
            Reach a tier
          </h2>
          <p className="mt-1 text-muted">
            Qualify on miles or on flights in the last 12 months, whichever comes first. A tier lasts 12 months.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-7 md:grid-cols-3 md:gap-0">
          {tiers.map((t) => {
            const lines = benefitLines(t, tiers).sort((a, b) => Number(b.included) - Number(a.included))
            return (
              <div key={t.code} className="flex flex-col gap-2 md:border-l md:border-line md:px-5 md:first:border-l-0 md:first:pl-0">
                <div className={cx('mb-3 rounded px-4 py-[18px]', TIER_ART[t.code])}>
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.12em]">{t.name}</span>
                  <strong className="block text-base font-extrabold">
                    {formatMiles(t.minMiles)} miles or {t.minFlights} flights
                  </strong>
                </div>
                {lines.map((line) => (
                  <div
                    key={line.key}
                    className={cx(
                      'flex items-center gap-2.5 border-b border-divider pt-1.5 pb-2 text-[13px]',
                      !line.included && 'text-[#9aa3b2]',
                    )}
                  >
                    <Icon name={line.included ? 'check' : 'dash'} size={14} color={line.included ? '#087338' : '#9aa3b2'} />
                    {line.included ? benefitSentence(line) : BENEFIT_NAMES[line.key]}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
