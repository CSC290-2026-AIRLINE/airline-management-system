import { Fragment, useCallback, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { DialogFooter } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import type { AwardFlight, CabinCode, FlightStatus, StaffLoyaltyApi } from '../api/types'
import { useStaffLoyaltyApi } from '../api/use-staff-loyalty-api'
import { formatDate, formatMiles, parseWhole } from '../format'
import { CABINS, STATUS_LABEL } from '../labels'
import { DESKTOP, useMediaQuery } from '../use-media-query'
import { errorMessage, useLoad } from '../use-load'
import { Empty, Modal, Segmented, Stat } from './parts'
import { Loaded, StaffLoyaltyLayout } from './StaffLoyaltyLayout'

const STATUS_TONE: Record<FlightStatus, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  delayed: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-700',
  departed: 'bg-muted text-muted-foreground',
}

type Saved = (flight: AwardFlight, firstRelease: boolean, cabinName: string, released: number) => void

// S7–S9 Award Release: choose how many seats on each flight members can buy with miles, and what they cost. The seats
// come out of feature 3b's normal inventory, so a cash sale and an award booking never take the same last seat.
export function AwardReleasePage() {
  const api = useStaffLoyaltyApi()
  const load = useCallback(() => api.getAwardFlights(), [api])
  const [state, reload] = useLoad(load)

  return (
    <StaffLoyaltyLayout
      title="Award Release"
      purpose="Choose how many seats on each flight members can buy with miles, and what they cost."
      info="Released seats come out of the flight’s normal inventory (Feature 3b). Seats left for miles = released minus redeemed."
    >
      <Loaded state={state} retry={reload}>
        {(flights) => <AwardFlights api={api} initial={flights} />}
      </Loaded>
    </StaffLoyaltyLayout>
  )
}

const seatsText = (f: AwardFlight, cabin: CabinCode) => {
  const r = f.releases[cabin]
  return r ? `${r.redeemed} / ${r.released}` : '—'
}

function StatusPill({ flight }: { flight: AwardFlight }) {
  return flight.returnedToCash ? (
    <Badge variant="secondary" className="bg-amber-50 text-amber-700">
      Returned to cash
    </Badge>
  ) : (
    <Badge variant="secondary" className={STATUS_TONE[flight.status]}>
      {STATUS_LABEL[flight.status]}
    </Badge>
  )
}

function AwardFlights({ api, initial }: { api: StaffLoyaltyApi; initial: AwardFlight[] }) {
  const [flights, setFlights] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)
  const desktop = useMediaQuery(DESKTOP)
  const open = flights.find((f) => f.flightId === openId) ?? null

  const onSaved: Saved = (saved, firstRelease, cabinName, released) => {
    setFlights(flights.map((f) => (f.flightId === saved.flightId ? saved : f)))
    setOpenId(null)
    toast.success(
      firstRelease
        ? `${released} ${cabinName} seat${released === 1 ? '' : 's'} released on ${saved.flightNumber}`
        : `Release updated on ${saved.flightNumber}`,
    )
  }

  // The Edit / Release button, or why the flight can't be changed.
  const action = (f: AwardFlight) => {
    if (f.status === 'cancelled' || f.status === 'departed') return <span className="text-sm text-muted-foreground">Closed</span>
    if (f.returnedToCash) return <span className="text-sm text-muted-foreground">Locked</span>
    const released = Object.keys(f.releases).length > 0
    return (
      <Button
        variant="link"
        size="sm"
        className="px-0"
        onClick={() => setOpenId(openId === f.flightId ? null : f.flightId)}
        aria-expanded={openId === f.flightId}
        aria-label={`${released ? 'Edit release' : 'Release seats'} on ${f.flightNumber}`}
      >
        {released ? 'Edit' : 'Release'}
      </Button>
    )
  }

  return (
    <Card aria-labelledby="flights">
      <CardHeader>
        <CardTitle id="flights">Flights from Feature 2</CardTitle>
      </CardHeader>
      <CardContent>
        {flights.length === 0 ? (
          <Empty title="No flights open for sale.">Flights appear here once Feature 2 schedules them.</Empty>
        ) : desktop ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flight</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Economy</TableHead>
                <TableHead className="text-right">Business</TableHead>
                <TableHead className="text-right">Cost (economy)</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flights.map((f) => {
                const cost = f.releases.economy?.milesCost
                const isOpen = open?.flightId === f.flightId
                return (
                  <Fragment key={f.flightId}>
                    <TableRow data-state={isOpen ? 'selected' : undefined} className={cn(isOpen && 'border-b-0')}>
                      <TableCell>
                        <div className="font-semibold">{f.route}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.flightNumber} · {formatDate(f.departsAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusPill flight={f} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{seatsText(f, 'economy')}</TableCell>
                      <TableCell className="text-right tabular-nums">{seatsText(f, 'business')}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{cost ? formatMiles(cost) : '—'}</TableCell>
                      <TableCell className="text-right">{action(f)}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow data-state="selected" className="hover:bg-muted/50">
                        <TableCell colSpan={6} className="px-6 pt-2 pb-6 whitespace-normal">
                          <ReleaseEditor
                            key={f.flightId}
                            api={api}
                            flight={f}
                            layout="inline"
                            onClose={() => setOpenId(null)}
                            onSaved={onSaved}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Flights">
            {flights.map((f) => (
              <li key={f.flightId} className="flex flex-col gap-2.5 rounded-lg border px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{f.route}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.flightNumber} · {formatDate(f.departsAt)}
                    </div>
                  </div>
                  <StatusPill flight={f} />
                </div>
                <dl className="m-0 grid grid-cols-3 gap-2">
                  <Stat label="Economy" value={seatsText(f, 'economy')} />
                  <Stat label="Business" value={seatsText(f, 'business')} />
                  <Stat label="Miles (eco)" value={f.releases.economy ? formatMiles(f.releases.economy.milesCost) : '—'} />
                </dl>
                <div className="flex justify-end">{action(f)}</div>
              </li>
            ))}
          </ul>
        )}

        {open && !desktop && (
          <ReleaseEditor key={open.flightId} api={api} flight={open} layout="sheet" onClose={() => setOpenId(null)} onSaved={onSaved} />
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          Seat columns show redeemed / released. Departed and cancelled flights are closed. Within the award cutoff before departure (72
          hours, set in Loyalty Rules) the unredeemed seats go back to cash sale and the release is locked.
        </p>
      </CardFooter>
    </Card>
  )
}

// S7a–S7m Release seats / Edit release, S7h below-redeemed error. Inline under the flight row on desktop, a dialog on
// phones.
function ReleaseEditor({
  api,
  flight,
  layout,
  onClose,
  onSaved,
}: {
  api: StaffLoyaltyApi
  flight: AwardFlight
  layout: 'inline' | 'sheet'
  onClose: () => void
  onSaved: Saved
}) {
  const firstRelease = Object.keys(flight.releases).length === 0
  const [cabin, setCabin] = useState<CabinCode>(() => CABINS.find((c) => flight.aircraft.cabins.includes(c.code))?.code ?? 'economy')
  const current = flight.releases[cabin]
  const [seatsInput, setSeatsInput] = useState(current ? String(current.released) : '')
  const [milesInput, setMilesInput] = useState(current ? formatMiles(current.milesCost) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redeemed = current?.redeemed ?? 0
  const seats = parseWhole(seatsInput)
  const miles = parseWhole(milesInput)
  const belowRedeemed = Number.isInteger(seats) && seats < redeemed
  const missing = CABINS.filter((c) => !flight.aircraft.cabins.includes(c.code)).map((c) => c.name)
  const cabinName = CABINS.find((c) => c.code === cabin)?.name ?? cabin
  const title = firstRelease ? 'Release seats' : 'Edit release'
  const sheet = layout === 'sheet'
  const seatsId = `seats-${flight.flightId}`
  const milesId = `miles-${flight.flightId}`

  const pickCabin = (next: CabinCode) => {
    const r = flight.releases[next]
    setCabin(next)
    setSeatsInput(r ? String(r.released) : '')
    setMilesInput(r ? formatMiles(r.milesCost) : '')
    setError(null)
  }

  const step = (by: number) => setSeatsInput(String(Math.max(0, (Number.isInteger(seats) ? seats : 0) + by)))

  const submit = async () => {
    if (belowRedeemed) return
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.saveRelease(flight.flightId, cabin, seats, miles), firstRelease, cabinName, seats)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  const actions = (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button type="button" onClick={() => void submit()} disabled={busy || belowRedeemed}>
        {firstRelease ? 'Release seats' : 'Save release'}
      </Button>
    </>
  )

  const body = (
    <div className="flex flex-col gap-4 text-left">
      {sheet ? (
        <p className="text-sm text-muted-foreground">
          {flight.route} · {formatDate(flight.departsAt)} · {STATUS_LABEL[flight.status]}
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-lg font-bold">{title}</h3>
          <span className="text-sm text-muted-foreground">
            {flight.flightNumber} · {flight.route} · {formatDate(flight.departsAt)} · {STATUS_LABEL[flight.status]}
          </span>
        </div>
      )}

      <div className={cn('grid gap-4', !sheet && 'grid-cols-[minmax(0,1fr)_auto] items-end')}>
        <div className="flex flex-col gap-2">
          <Label>Cabin</Label>
          <Segmented
            label="Cabin"
            value={cabin}
            onChange={pickCabin}
            options={CABINS.map((c) => ({ value: c.code, label: c.name, disabled: !flight.aircraft.cabins.includes(c.code) }))}
          />
        </div>
        <dl className="grid grid-cols-2 gap-2.5 lg:w-[310px]">
          <Stat label="Released now" value={String(current?.released ?? 0)} tone="bg-background border" />
          <Stat label="Already redeemed" value={String(redeemed)} tone="bg-background border" />
        </dl>
      </div>
      {missing.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {missing.join(' and ')} {missing.length === 1 ? 'isn’t' : 'aren’t'} on this aircraft ({flight.aircraft.name},{' '}
          {flight.aircraft.cabins.length} cabins).
        </span>
      )}

      <div className={cn('grid gap-4', !sheet && 'grid-cols-[200px_200px_minmax(0,1fr)_auto] items-end')}>
        <div className="flex flex-col gap-2">
          <Label htmlFor={seatsId}>Seats released</Label>
          <div className="flex items-center gap-2">
            {sheet && (
              <Button type="button" variant="outline" size="icon" onClick={() => step(-1)} aria-label="One seat fewer">
                <Minus />
              </Button>
            )}
            <Input
              id={seatsId}
              className={cn(sheet && 'text-center')}
              inputMode="numeric"
              value={seatsInput}
              onChange={(e) => setSeatsInput(e.target.value)}
              aria-invalid={belowRedeemed}
            />
            {sheet && (
              <Button type="button" variant="outline" size="icon" onClick={() => step(1)} aria-label="One seat more">
                <Plus />
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={milesId}>Miles per seat</Label>
          <Input id={milesId} inputMode="numeric" value={milesInput} onChange={(e) => setMilesInput(e.target.value)} />
        </div>
        <p
          className={cn('m-0 text-xs', belowRedeemed ? 'text-destructive' : 'text-muted-foreground')}
          role={belowRedeemed ? 'alert' : undefined}
        >
          {belowRedeemed
            ? `Can’t go below the ${redeemed} seats already redeemed.`
            : firstRelease
              ? 'Seats come out of the flight’s normal inventory. Miles bookings close 72 hours before departure.'
              : 'Seats cannot go below the number already redeemed. A new cost applies to future redemptions only.'}
        </p>
        {!sheet && <div className="flex gap-2.5">{actions}</div>}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {sheet && <DialogFooter>{actions}</DialogFooter>}
    </div>
  )

  return sheet ? (
    <Modal title={`${title} · ${flight.flightNumber}`} onClose={onClose}>
      {body}
    </Modal>
  ) : (
    body
  )
}
