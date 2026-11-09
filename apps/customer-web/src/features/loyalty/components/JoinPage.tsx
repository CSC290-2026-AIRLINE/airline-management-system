import { useState } from 'react'
import { Plane, Star, Ticket, Users } from 'lucide-react'
import type { MemberSummary, TierInfo } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { LoyaltyBareLayout } from './LoyaltyLayout'
import { TierCard } from './parts'
import { ReachTierHeading, TierColumns, TierTable } from './TierTables'
import { CONTAINER, cx, focusRing, ui } from './ui'

const FEATURES = [
  { icon: Plane, title: 'Earn on every flight', body: 'Miles = route distance × your fare rate, added after you fly.' },
  { icon: Users, title: 'Earn for your family', body: 'Book for family or friends and the miles for every seat go to you.' },
  { icon: Ticket, title: 'Spend on award seats', body: 'Pay the fare with miles on selected flights. Taxes go on your card.' },
  { icon: Star, title: 'Unlock tier benefits', body: 'Lounge access, extra bags, priority lanes, upgrades and insurance.' },
] as const

// Worked example for "How miles are earned": BKK → HKG is 1,722 km.
const EXAMPLE_KM = 1722
const EXAMPLE_FARES = [
  { label: 'Discount', multiplier: 0.5 },
  { label: 'Full fare', multiplier: 1 },
  { label: 'Business', multiplier: 1.5 },
] as const

// C01 Join FlySmiles and C01b with the terms ticked. Shown only to customers who have not joined.
export function JoinPage({
  tiers,
  name,
  email,
  onJoined,
}: {
  tiers: TierInfo[]
  name: string
  email: string
  onJoined: (m: MemberSummary) => void
}) {
  const api = useLoyaltyApi()
  const [agreed, setAgreed] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstName = name.split(' ')[0]

  async function join() {
    setJoining(true)
    setError(null)
    try {
      onJoined(await api.join())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not create your membership. Please try again.')
      setJoining(false)
    }
  }

  return (
    <LoyaltyBareLayout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[linear-gradient(100deg,#13264a_0%,#13264a_45%,#1f3e6e_75%,#3b6d9a_100%)] text-white">
        <div className={cx(CONTAINER, 'relative grid items-center gap-8 py-12 sm:py-20 lg:grid-cols-2')}>
          <div className="flex max-w-[480px] flex-col gap-4">
            <span className="text-[11px] font-bold tracking-[0.14em] text-[#f5a524]">FLYSMILES · FREE TO JOIN</span>
            <h1 className="text-[34px] leading-tight font-bold sm:text-5xl">Join FlySmiles</h1>
            <p className="text-[15px] leading-relaxed text-white/85 sm:text-base">
              Join free and earn miles on every flight you book, for you and everyone you book for.
            </p>
            <a href="#join" className={cx(ui.buttonOnDark, 'w-fit')}>
              Join for free
            </a>
          </div>
          <div className="relative hidden h-64 lg:block" aria-hidden="true">
            <TierCard code="platinum" name="Platinum" className="absolute top-6 left-[8%] w-56 -rotate-6" />
            <TierCard code="silver" name="Silver" className="absolute top-0 right-[10%] w-56 rotate-3" />
            <TierCard code="gold" name="Gold" className="absolute bottom-0 left-[32%] w-56 rotate-1" />
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="bg-white py-12 sm:py-16">
        <ul className={cx(CONTAINER, 'm-0 grid list-none grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0')}>
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-2 lg:border-r lg:border-line lg:px-7 lg:first:pl-0 lg:last:border-0">
              <Icon size={24} className="text-teal" aria-hidden="true" />
              <strong className="mt-2 text-[15px]">{title}</strong>
              <span className="text-[13px] text-muted">{body}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Reach a tier */}
      <section className="bg-white pb-14 sm:pb-24">
        <div className={cx(CONTAINER, 'flex flex-col gap-8 sm:gap-10')}>
          <ReachTierHeading />
          <div className="hidden md:block md:px-4 lg:px-8">
            <TierTable tiers={tiers} />
          </div>
          <div className="md:hidden">
            <TierColumns tiers={tiers} />
          </div>
        </div>
      </section>

      {/* How miles are earned */}
      <section className="bg-white pb-14 sm:pb-20">
        <div className={cx(CONTAINER, 'grid items-center gap-8 lg:grid-cols-2')}>
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold sm:text-[32px]">How miles are earned</h2>
            <p className="max-w-md text-[13px] text-muted sm:text-sm">
              Miles = route distance in km × your fare rate. A cheaper ticket earns less than a full fare on the same route.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <strong className="text-2xl">BKK</strong>
              <Plane size={20} className="text-teal" aria-label="to" />
              <strong className="text-2xl">HKG</strong>
              <span className="text-xs text-muted">· 1,722 km</span>
            </div>
            <dl className="m-0 grid grid-cols-3 divide-x divide-line">
              {EXAMPLE_FARES.map((f) => (
                <div key={f.label} className="flex flex-col gap-1 px-3 first:pl-0 sm:px-5">
                  <dt className="text-[11px] text-muted">
                    {f.label} × {f.multiplier.toFixed(2)}
                  </dt>
                  <dd className="m-0 text-base font-bold text-teal sm:text-xl">
                    {Math.round(EXAMPLE_KM * f.multiplier).toLocaleString('en-GB')} miles
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Ready to join */}
      <section id="join" className="scroll-mt-4 bg-navy py-12 text-white sm:py-20">
        <div className={cx(CONTAINER, 'grid items-center gap-10 lg:grid-cols-2')}>
          <div className="relative mx-auto hidden h-64 w-full max-w-md sm:block" aria-hidden="true">
            <TierCard code="platinum" name="Platinum" className="absolute top-4 left-0 w-56 rotate-6" />
            <TierCard code="silver" name="Silver" className="absolute top-0 right-0 w-56 -rotate-3" />
            <TierCard code="gold" name="Gold" className="absolute bottom-0 left-[22%] w-56 -rotate-1" />
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold sm:text-[32px]">Ready to join, {firstName}?</h2>
            <p className="text-sm text-white/85">
              Joining as {name} · {email}. You get a member number straight away.
            </p>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-white/75">
              <li>Miles go to the member who books, for everyone on the booking.</li>
              <li>Miles expire 36 months after the flight. We remind you 30 days before.</li>
            </ul>
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className={cx('size-[18px] cursor-pointer accent-[#f5a524]', focusRing)}
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              I agree to the FlySmiles terms.
            </label>
            <button
              type="button"
              className={cx(ui.buttonOnDark, 'w-full disabled:border-white/30 disabled:bg-white/80 disabled:text-[#8a94a6] sm:w-fit')}
              disabled={!agreed || joining}
              onClick={() => void join()}
            >
              {joining ? 'Joining…' : 'Join FlySmiles'}
            </button>
            <p className="text-xs text-white/70" aria-live="polite">
              {error ? (
                <span className="text-[#ffb4ab]">{error}</span>
              ) : agreed ? (
                'You can join now.'
              ) : (
                'Tick the box to agree to the terms before you join.'
              )}
            </p>
          </div>
        </div>
      </section>
    </LoyaltyBareLayout>
  )
}
