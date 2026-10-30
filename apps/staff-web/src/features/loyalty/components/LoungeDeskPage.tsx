import { useCallback, useState, type FormEvent } from 'react'
import type { LoungeResult } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { loungeLabel } from '../labels'
import { errorMessage, useLoad } from '../use-load'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'
import { ui } from './ui'

// S10–S14 Lounge Desk: check a member in against their tier (Feature 11) and ticket (Feature 3b), and record guests.
export function LoungeDeskPage() {
  const api = useStaffLoyaltyApi()
  const loadVisits = useCallback(() => api.getLoungeVisits(), [api])
  const [visits, reloadVisits] = useLoad(loadVisits)
  const [query, setQuery] = useState('')
  const [guests, setGuests] = useState('0')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<LoungeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const outcome = await api.checkInLounge(query, Number(guests) || 0)
      setResult(outcome)
      if (outcome.outcome === 'admitted') reloadVisits()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StaffLoyaltyLayout
      title="Lounge Desk"
      purpose="Check a member in to the lounge and record their guests."
      info="A visit is checked against the tier (Feature 11) and the ticket (Feature 3b). One lounge visit per member per flight."
    >
      <div className={ui.gridEven}>
        <form className={ui.card} onSubmit={(e) => void submit(e)} aria-labelledby="check-in">
          <h2 id="check-in" className={ui.cardTitle}>
            Check in a member
          </h2>
          <label className={ui.field}>
            <span className={ui.label}>Member number or booking reference</span>
            <input
              className={ui.input}
              placeholder="e.g. FL10000142 or FLY7K2"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
            />
          </label>
          <label className={ui.field}>
            <span className={ui.label}>Guests</span>
            <input className={ui.input} type="number" min={0} max={9} value={guests} onChange={(e) => setGuests(e.target.value)} />
          </label>
          <button type="submit" className={ui.buttonPrimary} disabled={busy}>
            {busy ? 'Checking…' : 'Check in'}
          </button>
        </form>

        <section className={ui.card} aria-labelledby="result" aria-live="polite">
          <h2 id="result" className={ui.cardTitle}>
            Result
          </h2>
          {error ? (
            <div className={`${ui.result} ${ui.resultNo}`}>
              <strong>Not found</strong>
              <span>{error}</span>
            </div>
          ) : result ? (
            <Result result={result} />
          ) : (
            <div className={`${ui.result} ${ui.resultIdle}`}>Enter a member number and press Check in.</div>
          )}
        </section>
      </div>

      <section className={ui.card} aria-labelledby="today">
        <h2 id="today" className={ui.cardTitle}>
          Today at this desk
        </h2>
        <Loaded state={visits} retry={reloadVisits}>
          {(rows) =>
            rows.length === 0 ? (
              <p className={ui.muted}>No visits yet today.</p>
            ) : (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Member</th>
                      <th scope="col">Flight</th>
                      <th scope="col" className={ui.num}>
                        Guests
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => (
                      <tr key={v.id}>
                        <td>{v.time}</td>
                        <td>
                          {v.memberName} · {v.tierName}
                        </td>
                        <td>{v.flightNumber}</td>
                        <td className={ui.num}>{v.guests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </Loaded>
        <p className={ui.small}>The visit is saved in the member’s benefit history.</p>
      </section>
    </StaffLoyaltyLayout>
  )
}

function Result({ result }: { result: LoungeResult }) {
  const m = result.member
  const allowed = m.guestsAllowed === null ? 'No access' : `${m.guestsAllowed} guest${m.guestsAllowed === 1 ? '' : 's'}`
  const tierText = m.tierName ?? 'No tier'
  let title: string
  let text: string
  if (result.outcome === 'admitted') {
    title = `Admitted · ${result.guests === 0 ? 'member only' : `member + ${result.guests} guest${result.guests === 1 ? '' : 's'}`}`
    text = `Visit recorded for ${result.flightNumber}. ${tierText} includes lounge access for the ${loungeLabel(m.guestsAllowed).toLowerCase()}.`
  } else {
    switch (result.reason) {
      case 'too_many_guests':
        title = 'Not allowed: too many guests'
        text = `${tierText} includes the ${loungeLabel(m.guestsAllowed).toLowerCase()}. Check in again with ${m.guestsAllowed ?? 0} guests.`
        break
      case 'no_ticket':
        title = 'Not allowed: no ticket in the next 4 hours'
        text = 'The member needs a confirmed or checked-in ticket on a flight leaving within 4 hours.'
        break
      case 'no_tier':
        title = 'Not allowed: no tier'
        text = 'This member has no tier, so lounge access is not included.'
        break
      case 'already_visited':
        title = 'Not allowed: already visited'
        text = 'One lounge visit per member per flight.'
        break
      default: {
        const unreachable: never = result.reason
        return unreachable
      }
    }
  }

  return (
    <>
      <div className={`${ui.result} ${result.outcome === 'admitted' ? ui.resultOk : ui.resultNo}`}>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
      <div className={ui.gridEven} style={{ gap: 8 }}>
        <div className={ui.stat}>
          <span>Member</span>
          <strong>
            {m.name} · {m.memberNumber}
          </strong>
        </div>
        <div className={ui.stat}>
          <span>Tier</span>
          <strong>{tierText}</strong>
        </div>
        <div className={ui.stat}>
          <span>Guests allowed</span>
          <strong>{allowed}</strong>
        </div>
        <div className={ui.stat}>
          <span>Ticket</span>
          <strong>{m.ticket ?? 'None in the next 4 hours'}</strong>
        </div>
      </div>
    </>
  )
}
