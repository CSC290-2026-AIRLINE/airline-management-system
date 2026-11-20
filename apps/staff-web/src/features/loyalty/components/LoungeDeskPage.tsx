import { useCallback, useState, type FormEvent } from 'react'
import { CircleCheck, CircleX } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { LoungeResult, TierCode } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { loungeLabel } from '../labels'
import { errorMessage, useLoad } from '../use-load'
import { Stat } from './parts'
import { TIER_TONE } from './tones'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'

const TIER_BY_NAME: Record<string, TierCode> = { Silver: 'silver', Gold: 'gold', Platinum: 'platinum' }

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
    <StaffLoyaltyLayout title="Lounge Desk" purpose="Check a member in to the lounge and record their guests.">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card aria-labelledby="check-in">
            <CardHeader>
              <CardTitle id="check-in">Check in a member</CardTitle>
              <CardDescription>
                Checked against the tier (Feature 11) and the ticket (Feature 3b). One visit per member per flight.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid grid-cols-[minmax(0,1fr)_88px] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_110px_auto]"
                onSubmit={(e) => void submit(e)}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="lounge-query">Member number or booking reference</Label>
                  <Input
                    id="lounge-query"
                    placeholder="e.g. FL10000142 or FLY7K2"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="lounge-guests">Guests</Label>
                  <Input id="lounge-guests" type="number" min={0} max={9} value={guests} onChange={(e) => setGuests(e.target.value)} />
                </div>
                <Button type="submit" className="max-sm:col-span-2" disabled={busy}>
                  {busy ? 'Checking…' : 'Check in'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card aria-labelledby="result">
            <CardHeader>
              <CardTitle id="result">Result</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3" aria-live="polite">
              {error ? (
                <Alert variant="destructive">
                  <CircleX />
                  <AlertTitle>Not found</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : result ? (
                <Result result={result} />
              ) : (
                <p className="rounded-md bg-muted px-3.5 py-3 text-sm text-muted-foreground">Enter a member number and press Check in.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card aria-labelledby="today">
          <CardHeader>
            <CardTitle id="today">Today at this desk</CardTitle>
          </CardHeader>
          <CardContent>
            <Loaded state={visits} retry={reloadVisits}>
              {(rows) =>
                rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits yet today.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Member</TableHead>
                        <TableHead>Flight</TableHead>
                        <TableHead className="text-right">Guests</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>{v.time}</TableCell>
                          <TableCell className="whitespace-normal">
                            {v.memberName} · {v.tierName}
                          </TableCell>
                          <TableCell>{v.flightNumber}</TableCell>
                          <TableCell className="text-right tabular-nums">{v.guests}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              }
            </Loaded>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Admitted visits only · simulation time. Each visit is saved in the member’s benefit history.
            </p>
          </CardFooter>
        </Card>
      </div>
    </StaffLoyaltyLayout>
  )
}

function Result({ result }: { result: LoungeResult }) {
  const m = result.member
  const allowed = m.guestsAllowed === null ? 'No access' : `${m.guestsAllowed} guest${m.guestsAllowed === 1 ? '' : 's'}`
  const tierText = m.tierName ?? 'No tier'
  const tierCode = m.tierName ? TIER_BY_NAME[m.tierName] : undefined
  let title: string
  let text: string
  if (result.outcome === 'admitted') {
    title = `Admitted · ${result.guests === 0 ? 'member only' : `member + ${result.guests} guest${result.guests === 1 ? '' : 's'}`}`
    text = `Visit recorded for ${result.flightNumber}. ${tierText} includes lounge access for the ${loungeLabel(m.guestsAllowed).toLowerCase()}.`
  } else {
    switch (result.reason) {
      case 'too_many_guests':
        title = 'Not allowed: too many guests'
        text = `${tierText} includes the ${loungeLabel(m.guestsAllowed).toLowerCase()}. Check in again with ${m.guestsAllowed ?? 0} guest${m.guestsAllowed === 1 ? '' : 's'} or fewer.`
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

  const admitted = result.outcome === 'admitted'
  return (
    <>
      <Alert
        variant={admitted ? 'default' : 'destructive'}
        className={admitted ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}
      >
        {admitted ? <CircleCheck /> : <CircleX />}
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className={admitted ? 'text-emerald-800' : undefined}>{text}</AlertDescription>
      </Alert>
      <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Stat label="Member" value={`${m.name} · ${m.memberNumber}`} />
        <Stat label="Tier" value={tierText} tone={tierCode ? TIER_TONE[tierCode] : undefined} />
        <Stat label="Guests allowed" value={allowed} />
        <Stat label="Ticket" value={m.ticket ?? 'None in the next 4 hours'} />
      </dl>
    </>
  )
}
