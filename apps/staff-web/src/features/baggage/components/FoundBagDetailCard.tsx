import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Separator } from '@staff-web/components/ui/separator'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { cn } from '@staff-web/lib/utils'
import type { BagLocationEvent, BagTrackingHistory, FoundBag, RecordMoveBody } from '../api/found-bags'
import {
  BAG_COLOURS,
  BAG_TYPES,
  BAG_TYPE_LABELS,
  MOVE_LABELS,
  STAFF_MOVE_ACTIONS,
  STATUS_LABELS,
  STATUS_TONES,
  bagRef,
  bagSummary,
  colourLabel,
  flightLabel,
  formatEventTime,
  type BagColour,
  type BagType,
  type StaffMoveAction,
} from '../constants'
import { useDepartures, useFlight } from '../hooks/useBaggageFlights'
import { errorMessage, type Airport } from '../hooks/useFoundBags'
import { F10Card, FIELD_BOX, Field, FormError, Pill, SelectBox } from './primitives'

const H4 = 'm-0 font-sans text-[22px] font-semibold text-[#14213d]'

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-sm font-medium whitespace-nowrap text-[#677287]">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-base text-[#14213d]">{children}</dd>
    </div>
  )
}

function eventText(e: BagLocationEvent, flightNumber?: string): string {
  const sent = e.toAirport ? `Sent to ${e.toAirport}` : 'Sent'
  const what = {
    found: 'Found',
    held: 'Held',
    sent: flightNumber ? `${sent} on ${flightNumber}` : sent,
    arrived: 'Arrived',
    at_diverted_airport: 'At diverted airport',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
  }[e.action]
  return e.note ? `${what}: ${e.note}` : what
}

/** One timeline line. A sent event names its flight once the lookup answers. */
function EventText({ event }: { event: BagLocationEvent }) {
  const { flight } = useFlight(event.action === 'sent' ? event.sentOnFlightId : null)
  return <p className="min-w-0 flex-1 text-base text-[#14213d]">{eventText(event, flight?.flightNumber)}</p>
}

/** "Timeline": oldest first, the latest event marked in gold. */
function Timeline({ events }: { events: BagLocationEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-[#677287]">No location recorded yet.</p>
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => {
        const last = i === events.length - 1
        return (
          <li key={e.id} className="flex gap-3">
            <div aria-hidden className="flex flex-col items-center gap-1 pt-1.5">
              <span className={cn('size-2.5 rounded-full', last ? 'bg-[#fca311]' : 'bg-[#14213d]')} />
              {!last && <span className="w-px flex-1 bg-[#d8dce6]" />}
            </div>
            <div className={cn('flex min-w-0 flex-1 flex-col gap-1', !last && 'pb-4')}>
              <p className="text-xs text-[#677287]">
                {formatEventTime(e.occurredAt)} · {e.staffId ? 'Staff' : 'System'}
              </p>
              <div className="flex items-center gap-2">
                <Pill tone="grey">{e.airportCode}</Pill>
                <EventText event={e} />
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** "Check this diverted-flight bag" (frame 03). */
function CheckDivertedBag({
  onSave,
  onContinue,
}: {
  onSave: (bagType: BagType, colour: BagColour) => Promise<void>
  onContinue: () => Promise<void>
}) {
  const [bagType, setBagType] = useState<BagType>('suitcase')
  const [colour, setColour] = useState<BagColour>('grey')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e: unknown) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className={H4}>Check this diverted-flight bag</h3>
      <div className="flex gap-3">
        <Field label="Bag type" htmlFor="check-type">
          <SelectBox
            id="check-type"
            value={bagType}
            onValueChange={(v) => setBagType(v as BagType)}
            options={BAG_TYPES.map((t) => ({ value: t, label: BAG_TYPE_LABELS[t] }))}
          />
        </Field>
        <Field label="Colour" htmlFor="check-colour">
          <SelectBox
            id="check-colour"
            value={colour}
            onValueChange={(v) => setColour(v as BagColour)}
            options={BAG_COLOURS.map((c) => ({ value: c, label: colourLabel(c) }))}
          />
        </Field>
      </div>
      <FormError message={error} />
      <div className="flex justify-end gap-2 max-md:flex-col">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void run(onContinue)}
          className="h-auto rounded-lg border-[#d8dce6] px-3.5 py-2 text-sm leading-normal font-semibold text-[#14213d]"
        >
          Goes on with the flight
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void run(() => onSave(bagType, colour))}
          className="h-auto rounded-lg bg-[#14213d] px-3.5 py-2 text-sm leading-normal font-semibold text-white hover:bg-[#14213d]/90"
        >
          Save type and colour
        </Button>
      </div>
    </div>
  )
}

/** "Add a location" (frame 02). The event's airport comes from the bag's current place, so it is shown, not picked. */
function AddLocation({
  history,
  airports,
  onAdd,
}: {
  history: BagTrackingHistory
  airports: Airport[]
  onAdd: (body: RecordMoveBody) => Promise<void>
}) {
  const [action, setAction] = useState<StaffMoveAction>('held')
  const [toAirport, setToAirport] = useState('')
  // A pick only counts for the route it was made for, so changing "Sent to" clears it.
  const [pickedFlight, setPickedFlight] = useState<{ to: string; id: string } | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = history.current
  const eventAirport = action === 'arrived' && current?.inTransit && current.toAirport ? current.toAirport : (current?.airportCode ?? '')
  const destinations = airports.filter((a) => a.code !== current?.airportCode)
  const sending = action === 'sent' && !!toAirport
  const departures = useDepartures(sending ? (current?.airportCode ?? '') : '', sending ? toAirport : '')
  const flightId = sending
    ? pickedFlight?.to === toAirport && departures.some((f) => f.id === pickedFlight.id)
      ? pickedFlight.id
      : 'none'
    : ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (action === 'sent' && !toAirport) {
      setError('Choose where the bag was sent.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onAdd({
        action,
        toAirport: action === 'sent' ? toAirport : undefined,
        sentOnFlightId: sending && flightId !== 'none' ? flightId : undefined,
        note: note.trim() || undefined,
      })
      setNote('')
      setToAirport('')
      setPickedFlight(null)
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <h3 className={H4}>Add a location</h3>
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Field label="Airport" htmlFor="loc-airport">
            <Input id="loc-airport" value={eventAirport} readOnly className={FIELD_BOX} />
          </Field>
          <Field label="What happened" htmlFor="loc-action">
            <SelectBox
              id="loc-action"
              value={action}
              onValueChange={(v) => setAction(v as StaffMoveAction)}
              options={STAFF_MOVE_ACTIONS.map((a) => ({ value: a, label: MOVE_LABELS[a] }))}
            />
          </Field>
        </div>
        <div className="flex gap-3">
          <Field label="Sent to" htmlFor="loc-to">
            <SelectBox
              id="loc-to"
              value={toAirport}
              onValueChange={setToAirport}
              placeholder="Only for Sent"
              disabled={action !== 'sent'}
              options={destinations.map((a) => ({ value: a.code, label: a.code }))}
            />
          </Field>
          <Field label="On flight" htmlFor="loc-flight">
            <SelectBox
              id="loc-flight"
              value={flightId}
              onValueChange={(id) => setPickedFlight(id === 'none' ? null : { to: toAirport, id })}
              placeholder="Only for Sent"
              disabled={!sending}
              options={[
                { value: 'none', label: 'No flight' },
                ...departures.map((f) => ({ value: f.id, label: `${f.flightNumber} · ${formatEventTime(f.departsAt)}` })),
              ]}
            />
          </Field>
        </div>
        <Field label="Note" htmlFor="loc-note">
          <Input
            id="loc-note"
            maxLength={500}
            placeholder="e.g. Baggage store, shelf B4"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={FIELD_BOX}
          />
        </Field>
      </div>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-auto rounded-lg bg-[#14213d] px-3.5 py-2 text-sm leading-normal font-semibold text-white hover:bg-[#14213d]/90"
        >
          {saving ? 'Adding…' : 'Add location'}
        </Button>
      </div>
    </form>
  )
}

/** "Card / Bag detail": frame 02 for a normal bag, frame 03 for a diverted-flight bag that still needs checking. */
export function FoundBagDetailCard({
  bag,
  history,
  loading,
  error,
  airports,
  onRecordMove,
  onCompleteDetails,
  onContinueWithFlight,
}: {
  bag: FoundBag | null
  history: BagTrackingHistory | null
  loading: boolean
  error: string | null
  airports: Airport[]
  onRecordMove: (body: RecordMoveBody) => Promise<void>
  onCompleteDetails: (bagType: BagType, colour: BagColour) => Promise<void>
  onContinueWithFlight: () => Promise<void>
}) {
  const cameOff = useFlight(bag?.flightId)

  if (loading) {
    return (
      <F10Card aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
      </F10Card>
    )
  }
  if (error) {
    return (
      <F10Card>
        <FormError message={error} />
      </F10Card>
    )
  }
  if (!bag || !history) {
    return (
      <F10Card>
        <p className="text-sm text-[#677287]">Choose a bag in the list to see where it has been and add a location.</p>
      </F10Card>
    )
  }

  const diverted = bag.source === 'diverted_flight'
  const needsCheck = diverted && (!bag.bagType || !bag.colour) && bag.status === 'held'
  const closed = bag.status === 'delivered' || bag.status === 'continued_with_flight'
  const nowAt = history.current?.airportCode ?? bag.foundAirport
  const nowAtName = airports.find((a) => a.code === nowAt)?.name

  return (
    <F10Card aria-labelledby="bag-detail-title">
      {needsCheck && (
        <p className="rounded-lg bg-[#fff4de] px-3.5 py-3 text-base text-[#94651c]">
          This bag came off a diverted flight. Check it, then add the type and colour.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="bag-detail-title" className="m-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-[#14213d]">
          {bagRef(bag.id)}
        </h2>
        <Pill tone={STATUS_TONES[bag.status]}>{STATUS_LABELS[bag.status]}</Pill>
        {diverted && <Pill tone="grey">Diverted flight</Pill>}
      </div>
      <dl className="flex flex-col gap-2.5">
        <Fact label="Bag">{bagSummary(bag)}</Fact>
        <Fact label="Tag">{bag.tagNumber ?? 'No tag'}</Fact>
        <Fact label="Came off">{cameOff.flight ? flightLabel(cameOff.flight) : bag.flightId && cameOff.loading ? '…' : 'Not known'}</Fact>
        <Fact label="Now at">{nowAtName ? `${nowAt} · ${nowAtName}` : nowAt}</Fact>
        <Fact label="Checked bag">{bag.checkedBagId ? 'Linked' : 'Not linked'}</Fact>
        <Fact label="Source">{diverted ? 'Diverted flight (system)' : 'Staff'}</Fact>
      </dl>

      {needsCheck && (
        <>
          <Separator className="bg-[#d8dce6]" />
          <CheckDivertedBag onSave={onCompleteDetails} onContinue={onContinueWithFlight} />
          <Separator className="bg-[#d8dce6]" />
        </>
      )}

      <h3 className={H4}>Where it has been</h3>
      <Timeline events={history.events} />

      {!needsCheck && !closed && (
        <>
          <Separator className="bg-[#d8dce6]" />
          <AddLocation key={bag.id} history={history} airports={airports} onAdd={onRecordMove} />
        </>
      )}
    </F10Card>
  )
}
