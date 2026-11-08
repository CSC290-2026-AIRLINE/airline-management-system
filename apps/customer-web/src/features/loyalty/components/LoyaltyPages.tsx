import { useCallback, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import type { MemberSummary } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { useLoad } from '../use-load'
import { BenefitsPage } from './BenefitsPage'
import { Dashboard } from './Dashboard'
import { JoinPage } from './JoinPage'
import { LoyaltyLayout } from './LoyaltyLayout'
import { Loaded } from './parts'
import { RedemptionsPage } from './RedemptionsPage'
import type { StatementSearch } from '../statement-search'
import { StatementPage } from './StatementPage'
import { ui } from './ui'
import { WelcomePage } from './WelcomePage'

// Route-level pages: each loads what it needs through LoyaltyApi and renders the loading, error and ready states.
// A customer who has not joined is sent to /loyalty, which shows the Join page.

// /loyalty: Join (not a member), Welcome (just joined), or the Dashboard.
export function LoyaltyHomePage() {
  const api = useLoyaltyApi()
  const load = useCallback(async () => {
    const [member, tiers] = await Promise.all([api.getMember(), api.getTiers()])
    const activity = member ? await api.getStatement() : []
    return { member, tiers, activity }
  }, [api])
  const [state, retry] = useLoad(load)
  const [joined, setJoined] = useState<MemberSummary | null>(null)
  const [welcomed, setWelcomed] = useState(false)
  const { user } = useUser()

  if (state.status !== 'ready') {
    return (
      <LoyaltyLayout subtitle="Your miles, tier and recent activity.">
        <Loaded state={state} retry={retry}>
          {() => null}
        </Loaded>
      </LoyaltyLayout>
    )
  }

  const { member, tiers, activity } = state.data
  if (joined && !welcomed) {
    return <WelcomePage member={joined} tiers={tiers} onContinue={() => setWelcomed(true)} />
  }
  if (joined && welcomed) {
    return <Dashboard member={joined} tiers={tiers} activity={[]} />
  }
  if (!member) {
    // The Join page greets the customer by the name and email they signed in with.
    const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'there'
    return <JoinPage tiers={tiers} name={name} email={user?.primaryEmailAddress?.emailAddress ?? ''} onJoined={setJoined} />
  }
  return <Dashboard member={member} tiers={tiers} activity={activity} />
}

export function StatementRoutePage({ search, onSearch }: { search: StatementSearch; onSearch: (next: StatementSearch) => void }) {
  const api = useLoyaltyApi()
  const load = useCallback(async () => {
    const [member, rows] = await Promise.all([api.getMember(), api.getStatement()])
    return { member, rows }
  }, [api])
  const [state, retry] = useLoad(load)
  const member = state.status === 'ready' ? state.data.member : undefined
  if (member === null) return <Navigate to="/loyalty" replace />
  return (
    <LoyaltyLayout subtitle="Every mile you earned, spent, lost to expiry or had adjusted, with your balance after each." member={member}>
      <Loaded state={state} retry={retry}>
        {({ member: m, rows }) => m && <StatementPage member={m} rows={rows} search={search} onSearch={onSearch} />}
      </Loaded>
    </LoyaltyLayout>
  )
}

export function BenefitsRoutePage() {
  const api = useLoyaltyApi()
  const load = useCallback(async () => {
    const [member, tiers, uses] = await Promise.all([api.getMember(), api.getTiers(), api.getBenefitUses()])
    return { member, tiers, uses }
  }, [api])
  const [state, retry] = useLoad(load)
  const member = state.status === 'ready' ? state.data.member : undefined
  if (member === null) return <Navigate to="/loyalty" replace />
  return (
    <LoyaltyLayout subtitle="What your tier gives you, and what you have used." member={member}>
      <Loaded state={state} retry={retry}>
        {({ member: m, tiers, uses }) => m && <BenefitsPage member={m} tiers={tiers} uses={uses} />}
      </Loaded>
    </LoyaltyLayout>
  )
}

export function RedemptionsRoutePage() {
  const api = useLoyaltyApi()
  const load = useCallback(async () => {
    const [member, rows] = await Promise.all([api.getMember(), api.getRedemptions()])
    return { member, rows }
  }, [api])
  const [state, retry] = useLoad(load)
  const member = state.status === 'ready' ? state.data.member : undefined
  if (member === null) return <Navigate to="/loyalty" replace />
  return (
    <LoyaltyLayout subtitle="Seats you paid for with miles." member={member}>
      <Loaded state={state} retry={retry}>
        {({ rows }) => <RedemptionsPage rows={rows} />}
      </Loaded>
    </LoyaltyLayout>
  )
}

// Route errorComponent: one bad render shows this inside the page shell instead of blanking the app.
export function LoyaltyError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <LoyaltyLayout subtitle="Your miles, tier and recent activity.">
      <div className="flex flex-col items-start gap-3 rounded-xl border border-[#f3c2bd] bg-white p-5 text-danger" role="alert">
        <strong>Something went wrong on this page.</strong>
        <span className="text-[13px]">{error instanceof Error ? error.message : 'Please try again.'}</span>
        <button type="button" className={ui.button} onClick={reset}>
          Try again
        </button>
      </div>
    </LoyaltyLayout>
  )
}
