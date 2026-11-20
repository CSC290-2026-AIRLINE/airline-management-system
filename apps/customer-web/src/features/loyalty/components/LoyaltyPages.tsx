import { useCallback } from 'react'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { useLoad } from '../use-load'
import { BenefitsPage } from './BenefitsPage'
import { Dashboard } from './Dashboard'
import { LoyaltyLayout } from './LoyaltyLayout'
import { Loaded } from './parts'
import { RedemptionsPage } from './RedemptionsPage'
import type { StatementSearch } from '../statement-search'
import { StatementPage } from './StatementPage'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'

// Route-level pages: each loads what it needs through LoyaltyApi and renders the loading, error and ready states.
// Every customer is a Flython Miles member: the backend enrols them on their first visit, so there is no Join step.

// /loyalty: the Dashboard, straight away.
export function LoyaltyHomePage() {
  const api = useLoyaltyApi()
  const load = useCallback(async () => {
    const [member, tiers, activity] = await Promise.all([api.getMember(), api.getTiers(), api.getStatement()])
    return { member, tiers, activity }
  }, [api])
  const [state, retry] = useLoad(load)

  if (state.status !== 'ready') {
    return (
      <LoyaltyLayout>
        <Loaded state={state} retry={retry}>
          {() => null}
        </Loaded>
      </LoyaltyLayout>
    )
  }

  const { member, tiers, activity } = state.data
  return <Dashboard member={member} tiers={tiers} activity={activity} />
}

export function StatementRoutePage({ search, onSearch }: { search: StatementSearch; onSearch: (next: StatementSearch) => void }) {
  const api = useLoyaltyApi()
  const load = useCallback(async () => {
    const [member, rows] = await Promise.all([api.getMember(), api.getStatement()])
    return { member, rows }
  }, [api])
  const [state, retry] = useLoad(load)
  return (
    <LoyaltyLayout subtitle="Every mile you earned, spent, lost to expiry or had adjusted, with your balance after each.">
      <Loaded state={state} retry={retry}>
        {({ member, rows }) => <StatementPage member={member} rows={rows} search={search} onSearch={onSearch} />}
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
  return (
    <LoyaltyLayout subtitle="What your tier gives you, and what you have used.">
      <Loaded state={state} retry={retry}>
        {({ member, tiers, uses }) => <BenefitsPage member={member} tiers={tiers} uses={uses} />}
      </Loaded>
    </LoyaltyLayout>
  )
}

export function RedemptionsRoutePage() {
  const api = useLoyaltyApi()
  const load = useCallback(async () => {
    return { rows: await api.getRedemptions() }
  }, [api])
  const [state, retry] = useLoad(load)
  return (
    <LoyaltyLayout subtitle="Seats you paid for with miles.">
      <Loaded state={state} retry={retry}>
        {({ rows }) => <RedemptionsPage rows={rows} />}
      </Loaded>
    </LoyaltyLayout>
  )
}

// Route errorComponent: one bad render shows this inside the page shell instead of blanking the app.
export function LoyaltyError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <LoyaltyLayout>
      <Alert variant="destructive" className="bg-white">
        <AlertCircle />
        <AlertTitle>Something went wrong on this page.</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <p>{error instanceof Error ? error.message : 'Please try again.'}</p>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </LoyaltyLayout>
  )
}
