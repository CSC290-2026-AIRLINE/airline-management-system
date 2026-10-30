import { useCallback, useState } from 'react'
import { Dashboard } from './Dashboard'
import { JoinPage, WelcomePage } from './JoinPage'
import { Loaded } from './LoyaltyLayout'
import type { MemberSummary } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { useLoad } from '../use-load'

// /loyalty: the Join page for a customer who is not a member, Welcome right after joining, the Dashboard otherwise.
export function LoyaltyHomePage() {
  const api = useLoyaltyApi()
  const load = useCallback(() => Promise.all([api.getMember(), api.getTiers(), api.getStatement()]), [api])
  const [state, reload] = useLoad(load)
  const [joined, setJoined] = useState<MemberSummary | null>(null)

  return (
    <Loaded state={state} retry={reload}>
      {([member, tiers, statement]) => {
        if (joined) {
          return (
            <WelcomePage
              member={joined}
              tiers={tiers}
              onContinue={() => {
                setJoined(null)
                reload()
              }}
            />
          )
        }
        if (!member) return <JoinPage api={api} tiers={tiers} onJoined={setJoined} />
        return <Dashboard member={member} tiers={tiers} activity={statement.slice(0, 5)} />
      }}
    </Loaded>
  )
}
