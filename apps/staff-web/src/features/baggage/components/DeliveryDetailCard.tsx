import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Separator } from '@staff-web/components/ui/separator'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import type { BagDelivery, BagDeliveryDetail, DeliveryChoiceBody, HandOverBody, OwnershipCheck } from '../api/bag-deliveries'
import type { AddBagCostBody, BagCostSummary } from '../api/lost-reports'
import {
  COLLECTOR_LABELS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TONES,
  DELIVERY_TYPES,
  DELIVERY_TYPE_LABELS,
  ID_DOCUMENT_LABELS,
  OWNERSHIP_MISMATCH_LABELS,
  bagRef,
  deliveryDestination,
  formatEventTime,
  type DeliveryStatus,
  type DeliveryType,
} from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { CaseCosts } from './CaseCosts'
import { HandOverForm } from './HandOverForm'
import { F10Card, FIELD_BOX, Field, FormError, Pill, SelectBox } from './primitives'

const PRIMARY_BUTTON = 'h-auto rounded-lg bg-[#14213d] px-3.5 py-2 text-sm leading-normal font-semibold text-white hover:bg-[#14213d]/90'

const TYPE_OPTIONS = DELIVERY_TYPES.map((t) => ({ value: t, label: DELIVERY_TYPE_LABELS[t] }))

type NextStep = 'in_transit' | 'ready_for_pickup' | 'delivered'

/** What staff can set next. Delivered is reached through the ownership check. */
function nextSteps(d: BagDelivery): NextStep[] {
  const pickup = d.deliveryType === 'airport_pickup'
  switch (d.status) {
    case 'preparing':
      return pickup ? ['in_transit', 'ready_for_pickup'] : ['in_transit']
    case 'in_transit':
      return pickup ? ['ready_for_pickup'] : ['delivered']
    case 'ready_for_pickup':
      return ['delivered']
    default:
      return []
  }
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-sm font-medium whitespace-nowrap text-[#677287]">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-base break-words text-[#14213d]">{children}</dd>
    </div>
  )
}

/** "FB-0414 · out for delivery from NRT", "FB-0414 · in transit to NRT", "FB-0414 · at BKK". */
function bagWhere(d: BagDelivery): string {
  const bag = d.foundBag
  if (!bag) return '–'
  const ref = bagRef(bag.id)
  if (d.status === 'delivered') return `${ref} · delivered`
  if (bag.inTransit) return `${ref} · in transit to ${bag.toAirport ?? '–'}`
  if (d.status === 'in_transit' && d.deliveryType !== 'airport_pickup') return `${ref} · out for delivery from ${bag.currentAirport}`
  return `${ref} · at ${bag.currentAirport}`
}

/** The passenger's choice, taken by the desk. It can change until the bag is in transit. */
function ChoiceForm({ delivery, onSave }: { delivery: BagDelivery; onSave: (body: DeliveryChoiceBody) => Promise<void> }) {
  const [type, setType] = useState<DeliveryType>(delivery.deliveryType ?? 'home')
  const [address, setAddress] = useState(delivery.address ?? '')
  const [airport, setAirport] = useState(delivery.pickupAirport ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pickup = type === 'airport_pickup'
  const id = (field: string) => `choice-${field}-${delivery.id}`

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pickup && !/^[A-Za-z]{3}$/.test(airport.trim())) {
      setError('Enter the 3-letter code of the pickup airport.')
      return
    }
    if (!pickup && !address.trim()) {
      setError('Enter the delivery address.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(
        pickup ? { deliveryType: type, pickupAirport: airport.trim().toUpperCase() } : { deliveryType: type, address: address.trim() },
      )
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <h3 className="m-0 font-sans text-[22px] font-semibold text-[#14213d]">Delivery choice</h3>
      <Field label="Send to" htmlFor={id('type')}>
        <SelectBox id={id('type')} value={type} onValueChange={(v) => setType(v as DeliveryType)} options={TYPE_OPTIONS} />
      </Field>
      {pickup ? (
        <Field label="Pickup airport" htmlFor={id('airport')}>
          <Input
            id={id('airport')}
            maxLength={3}
            placeholder="NRT"
            value={airport}
            onChange={(e) => setAirport(e.target.value)}
            className={`${FIELD_BOX} uppercase`}
          />
        </Field>
      ) : (
        <Field label="Address" htmlFor={id('address')}>
          <Input id={id('address')} maxLength={500} value={address} onChange={(e) => setAddress(e.target.value)} className={FIELD_BOX} />
        </Field>
      )}
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
          {busy ? 'Saving…' : 'Save choice'}
        </Button>
      </div>
    </form>
  )
}

/** "Set delivery status" from frame 06. Choosing Delivered opens the ownership check instead of Update. */
function StatusForm({
  delivery,
  onSetStatus,
  onHandOver,
}: {
  delivery: BagDelivery
  onSetStatus: (status: 'in_transit' | 'ready_for_pickup') => Promise<void>
  onHandOver: (body: HandOverBody) => Promise<void>
}) {
  const steps = nextSteps(delivery)
  const [step, setStep] = useState<NextStep>(steps[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = steps.map((s) => ({ value: s, label: DELIVERY_STATUS_LABELS[s as DeliveryStatus] }))

  async function update() {
    if (step === 'delivered') return
    setBusy(true)
    setError(null)
    try {
      await onSetStatus(step)
    } catch (e: unknown) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 font-sans text-[22px] font-semibold text-[#14213d]">Set delivery status</h3>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <SelectBox id={`status-${delivery.id}`} value={step} onValueChange={(v) => setStep(v as NextStep)} options={options} />
        </div>
        {step !== 'delivered' && (
          <Button type="button" disabled={busy} onClick={() => void update()} className={PRIMARY_BUTTON}>
            {busy ? 'Saving…' : 'Update'}
          </Button>
        )}
      </div>
      <FormError message={error} />
      {step === 'delivered' && <HandOverForm key={delivery.id} deliveryId={delivery.id} onHandOver={onHandOver} />}
    </div>
  )
}

function CheckItem({ check }: { check: OwnershipCheck }) {
  const who =
    check.collector === 'representative' && check.representativeName ? check.representativeName : COLLECTOR_LABELS[check.collector]
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-[#f4f6fa] px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pill tone={check.passed ? 'green' : 'red'}>{check.passed ? 'Owner verified' : 'Not verified'}</Pill>
        <span className="text-xs text-[#677287]">
          {check.staffName ? `${check.staffName}, ` : ''}
          {formatEventTime(check.checkedAt)}
        </span>
      </div>
      <p className="text-sm text-[#14213d]">{`${who} · ${ID_DOCUMENT_LABELS[check.documentType]} ending ${check.documentLast4}`}</p>
      {check.mismatches.length > 0 && (
        <p className="text-sm text-danger">
          {`Did not match: ${check.mismatches.map((m) => OWNERSHIP_MISMATCH_LABELS[m].toLowerCase()).join(', ')}`}
        </p>
      )}
    </li>
  )
}

/** "Card / Delivery detail" from frame 06: the delivery, its next step, the ownership checks and the case's costs. */
export function DeliveryDetailCard({
  delivery,
  loading,
  error,
  onRecordChoice,
  onSetStatus,
  onHandOver,
  costs,
}: {
  delivery: BagDeliveryDetail | null
  loading: boolean
  error: string | null
  onRecordChoice: (id: string, body: DeliveryChoiceBody) => Promise<void>
  onSetStatus: (id: string, status: 'in_transit' | 'ready_for_pickup') => Promise<void>
  onHandOver: (id: string, body: HandOverBody) => Promise<void>
  costs: {
    summary: BagCostSummary | null
    loading: boolean
    error: string | null
    add: (body: AddBagCostBody) => Promise<void>
    remove: (costId: string) => Promise<void>
  }
}) {
  if (loading) {
    return (
      <F10Card aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </F10Card>
    )
  }
  if (!delivery) {
    return (
      <F10Card>
        {error ? <FormError message={error} /> : <p className="text-sm text-[#677287]">Choose a delivery to see its status and costs.</p>}
      </F10Card>
    )
  }

  const canChoose = delivery.status === 'waiting_choice' || delivery.status === 'preparing'
  const steps = nextSteps(delivery)
  const contact = delivery.contactPhone ?? delivery.contactEmail ?? '–'

  return (
    <F10Card aria-labelledby="delivery-detail-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="delivery-detail-title" className="m-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-[#14213d]">
          {delivery.caseNumber}
        </h2>
        <Pill tone={DELIVERY_STATUS_TONES[delivery.status]}>{DELIVERY_STATUS_LABELS[delivery.status]}</Pill>
      </div>

      <dl className="flex flex-col gap-2.5">
        <Fact label="Passenger">{`${delivery.passengerFirstName} ${delivery.passengerLastName}`}</Fact>
        <Fact label="Booking">{delivery.bookingReference}</Fact>
        <Fact label="Contact">{contact}</Fact>
        <Fact label="Send to">{deliveryDestination(delivery) ?? 'Not chosen yet'}</Fact>
        <Fact label="Found bag">{bagWhere(delivery)}</Fact>
        {delivery.deliveredAt && <Fact label="Delivered">{formatEventTime(delivery.deliveredAt)}</Fact>}
      </dl>

      {canChoose && (
        <>
          <Separator className="bg-[#d8dce6]" />
          <ChoiceForm
            key={`${delivery.id}:${delivery.updatedAt}`}
            delivery={delivery}
            onSave={(body) => onRecordChoice(delivery.id, body)}
          />
        </>
      )}

      {steps.length > 0 && (
        <>
          <Separator className="bg-[#d8dce6]" />
          <StatusForm
            key={`${delivery.id}:${delivery.status}`}
            delivery={delivery}
            onSetStatus={(status) => onSetStatus(delivery.id, status)}
            onHandOver={(body) => onHandOver(delivery.id, body)}
          />
        </>
      )}

      {delivery.ownershipChecks.length > 0 && (
        <>
          <Separator className="bg-[#d8dce6]" />
          <div className="flex flex-col gap-3">
            <h3 className="m-0 font-sans text-[22px] font-semibold text-[#14213d]">Ownership checks</h3>
            <ul className="flex flex-col gap-2">
              {delivery.ownershipChecks.map((c) => (
                <CheckItem key={c.id} check={c} />
              ))}
            </ul>
          </div>
        </>
      )}

      <Separator className="bg-[#d8dce6]" />

      <CaseCosts
        key={delivery.reportId}
        cancelled={false}
        summary={costs.summary}
        loading={costs.loading}
        error={costs.error}
        onAdd={costs.add}
        onRemove={costs.remove}
      />
    </F10Card>
  )
}
