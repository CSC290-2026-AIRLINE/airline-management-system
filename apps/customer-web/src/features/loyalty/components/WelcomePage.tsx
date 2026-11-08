import type { MemberSummary, TierInfo } from '../api/types'
import { LoyaltyBareLayout } from './LoyaltyLayout'
import { SearchFlightsLink } from './parts'
import { ReachTierHeading, TierColumns } from './TierTables'
import { CONTAINER, cx, ui } from './ui'

// C02 Welcome, straight after joining.
export function WelcomePage({ member, tiers, onContinue }: { member: MemberSummary; tiers: TierInfo[]; onContinue: () => void }) {
  return (
    <LoyaltyBareLayout>
      <section className="bg-[linear-gradient(100deg,#13264a_0%,#2b4569_55%,#7fb3c9_100%)] text-white">
        <div className={cx(CONTAINER, 'grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.4fr_1fr]')}>
          <div className="flex flex-col gap-4">
            <h1 className="text-[30px] leading-tight font-bold sm:text-[44px]">Welcome aboard, {member.name.split(' ')[0]}.</h1>
            <p className="text-sm text-white/85 sm:text-base">
              Your member number is ready. Miles are added after each flight on a booking you made.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-5">
              <button type="button" className={ui.buttonOnDark} onClick={onContinue}>
                Go to my membership
              </button>
              <SearchFlightsLink label="Book a flight" className="rounded text-sm font-semibold text-white underline underline-offset-4" />
            </div>
          </div>
          <div
            className="mx-auto flex aspect-[1.6] w-full max-w-[300px] -rotate-6 flex-col justify-between rounded-2xl bg-[linear-gradient(135deg,#0e5a73,#13264a)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.3)] sm:max-w-[280px]"
            aria-label={`Member card: ${member.name}, ${member.memberNumber}`}
          >
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-black tracking-[0.14em]">FLYSMILES</span>
              <span className="h-6 w-8 rounded-md bg-[#f3d27a]" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-bold tracking-[0.06em] uppercase">{member.name}</span>
              <span className="text-lg font-extrabold tracking-[0.08em]">{member.memberNumber}</span>
              <span className="w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold tracking-[0.08em]">MEMBER</span>
            </div>
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16">
        <div className={cx(CONTAINER, 'flex flex-col gap-8')}>
          <ReachTierHeading />
          <TierColumns tiers={tiers} />
        </div>
      </section>
    </LoyaltyBareLayout>
  )
}
