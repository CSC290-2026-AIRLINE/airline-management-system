// Feature 12 — Onboard Products. The Extra services section on the
// Booking Details page (page 1 of the Figma). Renders the CTA shell card
// (header + 3 tiles + open/closed banner) and the orders list card
// (with per-order cards and a cancel flow).
//
// Data flow:
// - `useAppAuth().fetchWithAuth` powers all three calls (booking already
//   loaded by the parent page; this section only loads the orders list).
// - Local state for orders / loading / error / cancel target.
// - On successful cancel, the affected order is updated in place rather
//   than refetching the whole list.

import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAppAuth } from '../../auth/AuthProvider'
import { cancelProductOrder, fetchProductOrdersForBooking } from './api'
import { CancelOrderDialog } from './CancelOrderDialog'
import { ProductOrderCard } from './ProductOrderCard'
import { defaultCutoffFor, formatDateTime } from './format'
import type { Booking, ProductOrder } from './types'

interface Props {
  booking: Booking
  preset?: 'ready' | 'duty-free' | 'waiting' | 'failed' | 'confirmed' | 'cancel-po-2041' | 'refund-requested' | undefined
  initialCancelTarget?: string | null
  refundIdHint?: string | null
}

type OrdersState = { kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'ready'; orders: ProductOrder[] }

export function ExtraServicesSection({ booking, preset, initialCancelTarget, refundIdHint }: Props) {
  const { fetchWithAuth, isLoading: isAuthLoading } = useAppAuth()
  const [now] = useState(() => Date.now())
  const [ordersState, setOrdersState] = useState<OrdersState>({ kind: 'loading' })
  const [cancelTarget, setCancelTarget] = useState<ProductOrder | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const cancelTargetSeededRef = useRef(false)

  useEffect(() => {
    if (isAuthLoading) return
    let cancelled = false
    fetchProductOrdersForBooking(booking.id, fetchWithAuth, preset)
      .then((data) => {
        if (cancelled) return
        setOrdersState({ kind: 'ready', orders: data })
        if (initialCancelTarget && !cancelTargetSeededRef.current) {
          const target = data.find((o) => o.id === initialCancelTarget)
          if (target) {
            setCancelTarget(target)
            cancelTargetSeededRef.current = true
          }
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setOrdersState({
          kind: 'error',
          error: e instanceof Error ? e.message : 'Failed to load orders',
        })
      })
    return () => {
      cancelled = true
    }
  }, [booking.id, fetchWithAuth, isAuthLoading, preset, initialCancelTarget])

  const orders = ordersState.kind === 'ready' ? ordersState.orders : []
  const activeOrders = orders.filter((o) => o.status === 'pending_payment' || o.status === 'confirmed')

  const ctaSubhead =
    activeOrders.length > 0
      ? `Choose a meal for each passenger, or add snacks, drinks and duty-free. You have ${activeOrders.length} active order(s) on this booking, listed below.`
      : 'Choose a meal for each passenger, or add snacks, drinks and duty-free.'

  const cutoffState = computeCutoffState(booking, now)

  async function handleConfirmCancel() {
    if (!cancelTarget) return
    setCancelPending(true)
    setCancelError(null)
    try {
      const updated = await cancelProductOrder(cancelTarget.id, fetchWithAuth)
      setOrdersState((prev) => {
        if (prev.kind !== 'ready') return prev
        return {
          kind: 'ready',
          orders: prev.orders.map((o) => (o.id === updated.id ? updated : o)),
        }
      })
      setCancelTarget(null)
    } catch (e: unknown) {
      setCancelError(e instanceof Error ? e.message : 'Failed to cancel order')
    } finally {
      setCancelPending(false)
    }
  }

  function handleDismissCancel() {
    setCancelTarget(null)
    setCancelError(null)
  }

  return (
    <section className="mt-8" aria-labelledby="f12-extra-services-heading">
      <h2 id="f12-extra-services-heading" className="font-sans font-bold text-foreground text-xl m-0 mb-1 tracking-[-0.2px] leading-normal">
        Extra services
      </h2>
      <p className="m-0 mb-4 text-muted-foreground text-sm leading-relaxed max-w-[720px]">
        Add meals, snacks and duty-free to this booking. You pay through checkout, and stock is held for you while you pay.
      </p>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden">
        <div className="flex items-center justify-between gap-6 py-1 pb-5">
          <div className="flex-1 min-w-0">
            <h3 className="font-sans font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">Make your journey your own</h3>
            <p className="m-0 text-muted-foreground text-sm leading-relaxed">{ctaSubhead}</p>
          </div>
          <Link
            to="/bookings/$bookingId/shop"
            params={{ bookingId: booking.id }}
            className="inline-flex items-center justify-center gap-1.5 h-10 px-[18px] rounded-lg text-sm font-semibold bg-primary text-primary-foreground border border-primary hover:bg-[#1c3556] no-underline whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 flex-none"
          >
            Add more extra services
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
          <article className="bg-[#f8fafc] border border-border rounded-xl p-3.5 flex flex-col gap-1 no-underline text-inherit">
            <h4 className="font-sans font-semibold text-foreground text-sm m-0 leading-normal">Meals</h4>
            <p className="m-0 text-muted-foreground text-[13px] leading-normal">Pick a dish for each passenger</p>
          </article>
          <article className="bg-[#f8fafc] border border-border rounded-xl p-3.5 flex flex-col gap-1 no-underline text-inherit">
            <h4 className="font-sans font-semibold text-foreground text-sm m-0 leading-normal">Snacks and drinks</h4>
            <p className="m-0 text-muted-foreground text-[13px] leading-normal">Nuts, brownies, coffee, juice</p>
          </article>
          <article className="bg-[#f8fafc] border border-border rounded-xl p-3.5 flex flex-col gap-1 no-underline text-inherit">
            <h4 className="font-sans font-semibold text-foreground text-sm m-0 leading-normal">Duty-free</h4>
            <p className="m-0 text-muted-foreground text-[13px] leading-normal">Perfume, scarves, chocolate, spirits</p>
          </article>
        </div>

        {cutoffState.kind === 'open' ? (
          <div
            className="flex items-center gap-2.5 px-6 py-3 text-sm leading-relaxed -mx-5 -mb-5 border-t rounded-none"
            style={{
              background: 'oklch(0.95 0.06 148)',
              color: 'oklch(0.48 0.15 148)',
              borderColor: 'oklch(0.88 0.10 148)',
            }}
            role="status"
          >
            <span className="w-2 h-2 rounded-full flex-none" style={{ background: 'oklch(0.48 0.15 148)' }} aria-hidden="true" />
            <span>Ordering open · Closes {formatDateTime(cutoffState.cutoffAt)}, 48 hours before departure.</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-2.5 px-6 py-3 text-sm leading-relaxed -mx-5 -mb-5 border-t bg-[#f5f5f7] text-[#525866] rounded-none border-border"
            role="status"
          >
            <span className="w-2 h-2 rounded-full bg-[#98a2b3] flex-none" aria-hidden="true" />
            <span>Ordering closed for all flights on this booking.</span>
          </div>
        )}
      </div>

      {ordersState.kind === 'error' && (
        <p className="text-[#b42318] bg-[#fff3f2] border border-[#fdb5b0] rounded-lg px-4 py-3 my-4 text-sm leading-[1.45]" role="alert">
          {ordersState.error}
        </p>
      )}

      {ordersState.kind === 'loading' ? (
        <div className="bg-[#f8fafc] text-muted-foreground border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden">
          <p className="m-0 text-[15px]">Loading your orders…</p>
        </div>
      ) : ordersState.kind === 'ready' && ordersState.orders.length > 0 ? (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden">
          <h3 className="font-sans font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">Your extra services orders</h3>
          <p className="m-0 mb-4 text-muted-foreground text-sm leading-relaxed">
            Orders on this booking. You can cancel until ordering closes for that flight.
          </p>
          <div className="flex flex-col gap-0 mt-4">
            {ordersState.orders.map((order) => (
              <ProductOrderCard
                key={order.id}
                order={order}
                passengers={booking.passengers}
                now={now}
                refundIdHint={refundIdHint}
                onCancel={(id) => {
                  const target = ordersState.orders.find((o) => o.id === id) ?? null
                  setCancelTarget(target)
                  setCancelError(null)
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#f8fafc] text-muted-foreground border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden">
          <p className="m-0 text-[15px]">You don&apos;t have any extra services orders yet.</p>
        </div>
      )}

      <CancelOrderDialog
        order={cancelTarget}
        isPending={cancelPending}
        error={cancelError}
        onConfirm={() => void handleConfirmCancel()}
        onCancel={handleDismissCancel}
      />
    </section>
  )
}

type CutoffState = { kind: 'open'; cutoffAt: string } | { kind: 'closed' }

// Soonest still-open cutoff across the booking's flights. If the API
// didn't return a per-flight `cutoffAt`, fall back to
// `scheduledDeparture - 48h` (the spec default for `order_window_hours`).
function computeCutoffState(booking: Booking, now: number): CutoffState {
  const candidates = booking.flights
    .map((f) => f.cutoffAt ?? defaultCutoffFor(f.scheduledDeparture))
    .map((iso) => ({ iso, t: new Date(iso).getTime() }))
    .filter((c) => c.t > now)
    .sort((a, b) => a.t - b.t)
  if (candidates.length === 0) return { kind: 'closed' }
  return { kind: 'open', cutoffAt: candidates[0].iso }
}
