import { useCallback, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import type { AwardFlight, AwardRoute, AwardSearchResult } from '../api/types'
import { useLoyaltyApi } from '../api/use-loyalty-api'
import { seatsFor, type AwardSearchParams } from '../award-search'
import { formatMiles } from '../format'
import { useLoad } from '../use-load'
import { CustomerNav } from './CustomerNav'
import { Loaded } from './parts'
import { CONTAINER, cx, focusRing, PAGE, ui } from './ui'

// C03f Flight search with miles (mobile first, also on desktop), with H2 (nothing released) and H3 (not a member).
// The miles price beside each flight is Feature 11's; cash fares and the booking itself are features 3a and 3b, so the
// trip summary hands over to them once they exist. Nothing is held or spent on this page.

const CABIN_LABEL: Record<string, string> = {
  economy: 'Economy',
  premium_economy: 'Premium Economy',
  business: 'Business',
  first: 'First',
}

const field = cx(
  'min-h-11 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink',
  'focus-visible:border-link focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-link/30',
)

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
    <div className={PAGE} data-full-bleed>
      <CustomerNav />
      <main className={cx(CONTAINER, 'flex max-w-[760px] flex-1 flex-col gap-[18px] pt-4 pb-11 sm:pt-8')}>
        <h1 className="text-2xl font-bold sm:text-[28px]">Flight search</h1>
        <Loaded state={routes} retry={retryRoutes}>
          {(list) => <SearchForm routes={list} search={search} onSearch={onSearch} />}
        </Loaded>
        {search.from && search.to && search.date ? (
          <Results key={JSON.stringify(search)} search={search} from={search.from} to={search.to} date={search.date} />
        ) : (
          <p className={ui.small}>Choose a route and date to see flights and their miles prices.</p>
        )}
      </main>
    </div>
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
    return <p className="rounded-xl bg-[#f4f6f9] p-4 text-[13px] text-muted">No flights are open for sale right now.</p>
  }

  return (
    <form onSubmit={submit} className={cx(ui.card, 'grid grid-cols-2 gap-3 p-4')} aria-label="Search flights">
      <label className="flex flex-col gap-1">
        <span className={ui.caps}>From</span>
        <select className={field} value={from} onChange={(e) => setFrom(e.target.value)}>
          {origins.map(([code, city]) => (
            <option key={code} value={code}>
              {city} ({code})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={ui.caps}>To</span>
        <select className={field} value={toValue} onChange={(e) => setTo(e.target.value)}>
          {destinations.map((d) => (
            <option key={d.destination} value={d.destination}>
              {d.destinationCity} ({d.destination})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={ui.caps}>Depart</span>
        <input className={field} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={ui.caps}>Return (optional)</span>
        <input
          className={field}
          type="date"
          min={date || undefined}
          value={hasReturn ? back : ''}
          disabled={!hasReturn}
          onChange={(e) => setBack(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={ui.caps}>Adults</span>
        <input className={field} type="number" min={1} max={9} value={adults} onChange={(e) => setAdults(Number(e.target.value) || 1)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={ui.caps}>Children</span>
        <input
          className={field}
          type="number"
          min={0}
          max={8}
          value={children}
          onChange={(e) => setChildren(Number(e.target.value) || 0)}
        />
      </label>
      <p className={cx('col-span-2', tooMany ? 'text-xs text-danger' : ui.small)} role={tooMany ? 'alert' : undefined}>
        {tooMany ? 'Up to 9 adults and children together.' : 'Up to 9 adults and children together. Lap infants take no award seat.'}
      </p>
      <button type="submit" className={cx(ui.buttonPrimary, 'col-span-2 min-h-12')} disabled={tooMany}>
        Search flights
      </button>
    </form>
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
        const isMember = out.milesBalance !== null
        const party = partyLabel(search.adults ?? 1, search.children ?? 0)
        return (
          <>
            {isMember ? (
              <p className="rounded-xl bg-[#e8eef7] px-4 py-3.5 text-[13px] font-medium text-link">
                Where you see “or … miles”, you can pay the fare with miles on the next step. Taxes and surcharges are still paid by card.
              </p>
            ) : (
              <p className="rounded-xl bg-[#e8eef7] px-4 py-3.5 text-[13px] font-medium text-link">
                FlySmiles members can pay the fare with miles where you see “or … miles”.{' '}
                <Link to="/loyalty" className={cx(ui.link, 'inline')}>
                  Join FlySmiles
                </Link>{' '}
                to use them. Taxes and surcharges are always paid by card.
              </p>
            )}
            <p className={ui.small}>
              Award seats as of {out.asOf.slice(11, 16)} UTC · simulated time · miles close {out.awardCutoffHours} hours before departure
              {isMember && ` · your balance ${formatMiles(out.milesBalance ?? 0)} miles`}
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
          <span className="text-[13px] text-muted">
            {first.originCity} → {first.destinationCity} · {dayLabel(date)}
          </span>
        )}
        <span className="text-xs text-muted">Miles shown are the total for {party}</span>
      </div>
      {result.flights.length === 0 ? (
        <p className="rounded-[14px] border border-line bg-white p-4 text-[13px] text-muted">No flights on this day. Try another date.</p>
      ) : (
        <>
          {!released && (
            <p className="rounded-[14px] bg-[#f4f6f9] p-4 text-[13px] text-muted">
              No award seats are released on this day. Cash fares are on Book a flight.
            </p>
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
      className={cx(
        'flex w-full flex-col gap-2 rounded-[14px] bg-white p-4 text-left font-sans text-ink',
        selected ? 'border-[1.5px] border-link' : 'border border-field',
        bookable ? 'cursor-pointer hover:border-link' : 'cursor-default',
        focusRing,
      )}
    >
      <span className="flex items-end gap-2 whitespace-nowrap">
        <span className="text-lg font-bold">
          {clock(f.departsAt, f.originTimeZone)} → {clock(f.arrivesAt, f.destinationTimeZone)}
        </span>
        {nextDay && <span className="text-xs font-semibold text-[#9a5b00]">+1 day</span>}
      </span>
      <span className="text-[12.5px] text-muted">
        {f.flightNumber} · {duration(f.durationMin)} · direct
      </span>
      <span className="flex flex-col gap-[3px] pt-2.5">
        {f.closed ? (
          <span className="text-[12.5px] text-muted">Miles are closed this close to departure.</span>
        ) : f.cabins.length === 0 ? (
          <span className="text-[12.5px] text-muted">No award seats on this flight</span>
        ) : (
          f.cabins.map((c) => (
            <span key={c.cabin} className="flex flex-col gap-[3px]">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={cx('text-sm font-semibold', c.enoughSeats ? 'text-link' : 'text-muted line-through')}>
                  or {formatMiles(c.totalMiles)} miles + taxes
                </span>
                <span className="text-[12.5px] font-semibold text-muted">{CABIN_LABEL[c.cabin] ?? c.cabin}</span>
              </span>
              <span className="text-[12.5px] text-muted">
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
    <section className="flex flex-col gap-2.5 rounded-[14px] bg-[#f4f6f9] p-4" aria-labelledby="your-trip">
      <h2 id="your-trip" className="text-[17px] font-bold">
        Your trip
      </h2>
      <p className="text-[13px] text-muted">
        {chosen.length > 0 ? chosen.map((f) => f.flightNumber).join(' + ') : 'Pick a flight with award seats'} · {party}
      </p>
      {complete && (
        <p className="text-sm">
          From <strong>{formatMiles(miles)} miles</strong> + taxes by card
          {balance !== null &&
            (shortfall > 0 ? (
              <span className="text-danger"> · {formatMiles(shortfall)} miles short</span>
            ) : (
              <span className="text-muted"> · {formatMiles(balance - miles)} miles left after</span>
            ))}
        </p>
      )}
      <button type="button" className={cx(ui.buttonPrimary, 'min-h-12 w-full rounded-[10px] text-[15px]')} disabled>
        Continue
      </button>
      <p className={ui.small}>
        Booking with miles opens on Passengers &amp; extras (Feature 3b), which holds the seats and spends the miles. It is not live yet.
      </p>
    </section>
  )
}
