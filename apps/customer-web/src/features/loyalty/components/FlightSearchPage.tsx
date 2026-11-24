import { useCallback, useState, type FormEvent } from 'react'
import { Info } from 'lucide-react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import type { AwardFlight, AwardRoute, AwardSearchResult } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { seatsFor, type AwardSearchParams } from '../award-search'
import { formatMiles } from '../format'
import { useLoad } from '../use-load'
import { Loaded } from './parts'
import { Page } from '@customer-web/components/Page'
import { BODY, cx } from './ui'

// C03f Flight search with miles (mobile first, also on desktop), with H2 (nothing released) and H3 (not a member).
// The miles price beside each flight is Feature 11's; cash fares and the booking itself are features 3a and 3b, so the
// trip summary hands over to them once they exist. Nothing is held or spent on this page.

const CABIN_LABEL: Record<string, string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First',
}

const FIELD = 'h-11 w-full bg-white'
const CAPS = 'text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase'

function clock(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso))
  } catch {
    return iso.slice(11, 16)
  }
}

function localDay(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )

const duration = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} m`

function partyLabel(adults: number, children: number) {
  const parts = [`${adults} adult${adults === 1 ? '' : 's'}`]
  if (children > 0) parts.push(`${children} child${children === 1 ? '' : 'ren'}`)
  return parts.join(' + ')
}

export function FlightSearchPage({ search, onSearch }: { search: AwardSearchParams; onSearch: (next: AwardSearchParams) => void }) {
  const api = useLoyaltyApi()
  const loadRoutes = useCallback(() => api.getAwardRoutes(), [api])
  const [routes, retryRoutes] = useLoad(loadRoutes)

  return (
    <Page width="standard" title="Flight search">
      <div className={BODY}>
        <Loaded state={routes} retry={retryRoutes}>
          {(list) => <SearchForm routes={list} search={search} onSearch={onSearch} />}
        </Loaded>
        {search.from && search.to && search.date ? (
          <Results key={JSON.stringify(search)} search={search} from={search.from} to={search.to} date={search.date} />
        ) : (
          <p className="text-xs text-muted-foreground">Choose a route and date to see flights and their miles prices.</p>
        )}
      </div>
    </Page>
  )
}

function SearchForm({
  routes,
  search,
  onSearch,
}: {
  routes: AwardRoute[]
  search: AwardSearchParams
  onSearch: (next: AwardSearchParams) => void
}) {
  const [from, setFrom] = useState(search.from ?? routes[0]?.origin ?? '')
  const [to, setTo] = useState(search.to ?? '')
  const [date, setDate] = useState(search.date ?? '')
  const [back, setBack] = useState(search.back ?? '')
  const [adults, setAdults] = useState(search.adults ?? 1)
  const [children, setChildren] = useState(search.children ?? 0)

  const origins = [...new Map(routes.map((r) => [r.origin, r.originCity])).entries()]
  const destinations = routes.filter((r) => r.origin === from)
  const toValue = destinations.some((d) => d.destination === to) ? to : (destinations[0]?.destination ?? '')
  const hasReturn = routes.some((r) => r.origin === toValue && r.destination === from)
  const tooMany = adults + children > 9

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!from || !toValue || !date || tooMany) return
    onSearch({ from, to: toValue, date, back: hasReturn && back ? back : undefined, adults, children })
  }

  if (routes.length === 0) {
    return (
      <Alert>
        <Info />
        <AlertDescription>No flights are open for sale right now.</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="py-4 shadow-none">
      <CardContent className="px-4">
        <form onSubmit={submit} className="grid grid-cols-2 gap-3" aria-label="Search flights">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="award-from" className={CAPS}>
              From
            </Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger id="award-from" className={FIELD}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {origins.map(([code, city]) => (
                  <SelectItem key={code} value={code}>
                    {city} ({code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="award-to" className={CAPS}>
              To
            </Label>
            <Select value={toValue} onValueChange={setTo}>
              <SelectTrigger id="award-to" className={FIELD}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((d) => (
                  <SelectItem key={d.destination} value={d.destination}>
                    {d.destinationCity} ({d.destination})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="award-date" className={CAPS}>
              Depart
            </Label>
            <Input id="award-date" className={FIELD} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="award-back" className={CAPS}>
              Return (optional)
            </Label>
            <Input
              id="award-back"
              className={FIELD}
              type="date"
              min={date || undefined}
              value={hasReturn ? back : ''}
              disabled={!hasReturn}
              onChange={(e) => setBack(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="award-adults" className={CAPS}>
              Adults
            </Label>
            <Input
              id="award-adults"
              className={FIELD}
              type="number"
              min={1}
              max={9}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value) || 1)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="award-children" className={CAPS}>
              Children
            </Label>
            <Input
              id="award-children"
              className={FIELD}
              type="number"
              min={0}
              max={8}
              value={children}
              onChange={(e) => setChildren(Number(e.target.value) || 0)}
            />
          </div>
          <p className={cx('col-span-2 text-xs', tooMany ? 'text-danger' : 'text-muted-foreground')} role={tooMany ? 'alert' : undefined}>
            {tooMany ? 'Up to 9 adults and children together.' : 'Up to 9 adults and children together. Lap infants take no award seat.'}
          </p>
          <Button type="submit" className="col-span-2 h-12 bg-navy hover:bg-navy/90" disabled={tooMany}>
            Search flights
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Results({ search, from, to, date }: { search: AwardSearchParams; from: string; to: string; date: string }) {
  const api = useLoyaltyApi()
  const seats = seatsFor(search)
  const load = useCallback(async () => {
    const [out, ret] = await Promise.all([
      api.searchAwardFlights({ origin: from, destination: to, date, seats }),
      search.back ? api.searchAwardFlights({ origin: to, destination: from, date: search.back, seats }) : Promise.resolve(null),
    ])
    return { out, ret }
  }, [api, from, to, date, seats, search.back])
  const [state, retry] = useLoad(load)
  const [picked, setPicked] = useState<{ out?: string; ret?: string }>({})

  return (
    <Loaded state={state} retry={retry}>
      {({ out, ret }) => {
        const party = partyLabel(search.adults ?? 1, search.children ?? 0)
        return (
          <>
            <Alert className="border-[#c9d6ec] bg-[#e8eef7] text-link">
              <Info />
              <AlertDescription className="text-link">
                Where you see “or … miles”, you can pay the fare with miles on the next step. Taxes and surcharges are still paid by card.
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">
              Award seats as of {out.asOf.slice(11, 16)} UTC · simulated time · miles close {out.awardCutoffHours} hours before departure
              {` · your balance ${formatMiles(out.milesBalance)} miles`}
            </p>
            <Leg
              title="Leg 1 · Outbound"
              date={date}
              party={party}
              result={out}
              picked={picked.out}
              onPick={(id) => setPicked((p) => ({ ...p, out: id }))}
            />
            {ret && search.back && (
              <Leg
                title="Leg 2 · Return"
                date={search.back}
                party={party}
                result={ret}
                picked={picked.ret}
                onPick={(id) => setPicked((p) => ({ ...p, ret: id }))}
              />
            )}
            <TripSummary
              party={party}
              balance={out.milesBalance}
              legs={[out.flights.find((f) => f.flightId === picked.out), ret ? ret.flights.find((f) => f.flightId === picked.ret) : null]}
              needsReturn={Boolean(ret)}
            />
          </>
        )
      }}
    </Loaded>
  )
}

function Leg({
  title,
  date,
  party,
  result,
  picked,
  onPick,
}: {
  title: string
  date: string
  party: string
  result: AwardSearchResult
  picked: string | undefined
  onPick: (flightId: string) => void
}) {
  const first = result.flights[0]
  const released = result.flights.some((f) => f.cabins.length > 0)
  return (
    <section className="flex flex-col gap-2.5" aria-label={title}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {first && (
          <span className="text-[13px] text-muted-foreground">
            {first.originCity} → {first.destinationCity} · {dayLabel(date)}
          </span>
        )}
        <span className="text-xs text-muted-foreground">Miles shown are the total for {party}</span>
      </div>
      {result.flights.length === 0 ? (
        <Alert className="bg-white">
          <Info />
          <AlertDescription>No flights on this day. Try another date.</AlertDescription>
        </Alert>
      ) : (
        <>
          {!released && (
            <Alert className="border-0 bg-[#f4f6f9]">
              <Info />
              <AlertDescription>No award seats are released on this day. Cash fares are on Book a flight.</AlertDescription>
            </Alert>
          )}
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {result.flights.map((f) => (
              <li key={f.flightId}>
                <FlightCard flight={f} selected={picked === f.flightId} onPick={() => onPick(f.flightId)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function FlightCard({ flight: f, selected, onPick }: { flight: AwardFlight; selected: boolean; onPick: () => void }) {
  const nextDay = localDay(f.arrivesAt, f.destinationTimeZone) > localDay(f.departsAt, f.originTimeZone)
  const bookable = f.cabins.some((c) => c.enoughSeats)
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!bookable}
      aria-pressed={selected}
      // A selectable tile styled like the shadcn Card; there is no shadcn tile component.
      className={cx(
        'flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left font-sans text-card-foreground outline-none',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        selected ? 'border-link ring-1 ring-link' : 'border-border',
        bookable ? 'cursor-pointer hover:border-link' : 'cursor-default',
      )}
    >
      <span className="flex items-end gap-2 whitespace-nowrap">
        <span className="text-lg font-bold">
          {clock(f.departsAt, f.originTimeZone)} → {clock(f.arrivesAt, f.destinationTimeZone)}
        </span>
        {nextDay && <span className="text-xs font-semibold text-[#9a5b00]">+1 day</span>}
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        {f.flightNumber} · {duration(f.durationMin)} · direct
      </span>
      <span className="flex flex-col gap-[3px] pt-2.5">
        {f.closed ? (
          <span className="text-[12.5px] text-muted-foreground">Miles are closed this close to departure.</span>
        ) : f.cabins.length === 0 ? (
          <span className="text-[12.5px] text-muted-foreground">No award seats on this flight</span>
        ) : (
          f.cabins.map((c) => (
            <span key={c.cabin} className="flex flex-col gap-[3px]">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={cx('text-sm font-semibold', c.enoughSeats ? 'text-link' : 'text-muted-foreground line-through')}>
                  or {formatMiles(c.totalMiles)} miles + taxes
                </span>
                <span className="text-[12.5px] font-semibold text-muted-foreground">{CABIN_LABEL[c.cabin] ?? c.cabin}</span>
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {c.seatsLeft === 0
                  ? 'Award seats sold out'
                  : `${c.seatsLeft} award seat${c.seatsLeft === 1 ? '' : 's'} left${c.enoughSeats ? '' : ' · not enough for your party'}`}
                {c.enoughSeats && c.balanceCovers === false && ' · more miles than your balance'}
              </span>
            </span>
          ))
        )}
      </span>
    </button>
  )
}

function TripSummary({
  party,
  balance,
  legs,
  needsReturn,
}: {
  party: string
  balance: number | null
  legs: (AwardFlight | null | undefined)[]
  needsReturn: boolean
}) {
  const chosen = legs.filter((l): l is AwardFlight => Boolean(l))
  const complete = chosen.length === (needsReturn ? 2 : 1)
  // The cheapest cabin with enough seats on each chosen flight; the cabin itself is picked on Passengers & extras.
  const miles = chosen.reduce((sum, f) => sum + Math.min(...f.cabins.filter((c) => c.enoughSeats).map((c) => c.totalMiles)), 0)
  const shortfall = balance !== null && miles > balance ? miles - balance : 0

  return (
    <Card className="gap-3 border-0 bg-[#f4f6f9] py-4 shadow-none" aria-labelledby="your-trip">
      <CardHeader className="px-4">
        <CardTitle id="your-trip" className="text-[17px]">
          Your trip
        </CardTitle>
        <CardDescription className="text-[13px]">
          {chosen.length > 0 ? chosen.map((f) => f.flightNumber).join(' + ') : 'Pick a flight with award seats'} · {party}
        </CardDescription>
      </CardHeader>
      {complete && (
        <CardContent className="px-4 text-sm">
          From <strong>{formatMiles(miles)} miles</strong> + taxes by card
          {balance !== null &&
            (shortfall > 0 ? (
              <span className="text-danger"> · {formatMiles(shortfall)} miles short</span>
            ) : (
              <span className="text-muted-foreground"> · {formatMiles(balance - miles)} miles left after</span>
            ))}
        </CardContent>
      )}
      <CardFooter className="flex-col items-stretch gap-2.5 px-4">
        <Button className="h-12 w-full bg-navy text-[15px] hover:bg-navy/90" disabled>
          Continue
        </Button>
        <p className="text-xs text-muted-foreground">
          Booking with miles opens on Passengers &amp; extras (Feature 3b), which holds the seats and spends the miles. It is not live yet.
        </p>
      </CardFooter>
    </Card>
  )
}
