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
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Skeleton } from '@customer-web/components/ui/skeleton'
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
    fetchProductOrdersForBooking(booking, fetchWithAuth, preset)
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
  }, [booking, fetchWithAuth, isAuthLoading, preset, initialCancelTarget])

  const orders = ordersState.kind === 'ready' ? ordersState.orders : []
  const activeOrders = orders.filter((o) => o.status === 'pending_payment' || o.status === 'confirmed')

  const cutoffState = computeCutoffState(booking, now)

  async function handleConfirmCancel() {
    if (!cancelTarget) return
    setCancelPending(true)
    setCancelError(null)
    try {
      const updated = await cancelProductOrder(cancelTarget.id, fetchWithAuth, booking)
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
    <section className="space-y-4" aria-labelledby="f12-extra-services-heading">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle id="f12-extra-services-heading">Extra services</CardTitle>
          <CardDescription>
            Meals, snacks and duty-free for this booking. You pay at checkout, and stock is held for you while you pay.
            {activeOrders.length > 0 ? ` You have ${activeOrders.length} active ${activeOrders.length === 1 ? 'order' : 'orders'}.` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Meals</Badge>
            <Badge variant="outline">Snacks and drinks</Badge>
            <Badge variant="outline">Duty-free</Badge>
          </div>

          {cutoffState.kind === 'open' ? (
            <Alert role="status" className="border-green-200 bg-green-50 text-green-800">
              <AlertDescription className="col-start-2 text-green-800">
                Ordering open · Closes {formatDateTime(cutoffState.cutoffAt, cutoffState.timeZone)}.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert role="status">
              <AlertDescription className="col-start-2">Ordering closed for all flights on this booking.</AlertDescription>
            </Alert>
          )}

          <Button asChild className="w-full sm:w-fit">
            <Link to="/bookings/$reference/shop" params={{ reference: booking.reference }}>
              {activeOrders.length > 0 ? 'Add more extra services' : 'Add extra services'}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {ordersState.kind === 'error' && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="col-start-2">{ordersState.error}</AlertDescription>
        </Alert>
      )}

      {ordersState.kind === 'loading' ? (
        <Card>
          <CardContent className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ) : ordersState.kind === 'ready' && ordersState.orders.length > 0 ? (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle>Your orders</CardTitle>
            <CardDescription>You can cancel an order until ordering closes for its flight.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
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
          </CardContent>
        </Card>
      ) : ordersState.kind === 'ready' ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">You don&apos;t have any extra services orders yet.</CardContent>
        </Card>
      ) : null}

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

type CutoffState = { kind: 'open'; cutoffAt: string; timeZone: string | null } | { kind: 'closed' }

// Soonest still-open cutoff across the booking's flights. If the API
// didn't return a per-flight `cutoffAt`, fall back to
// `scheduledDeparture - 48h` (the spec default for `order_window_hours`).
function computeCutoffState(booking: Booking, now: number): CutoffState {
  const candidates = booking.flights
    .map((f) => ({ iso: f.cutoffAt ?? defaultCutoffFor(f.scheduledDeparture), timeZone: f.departureTimeZone ?? null }))
    .map((c) => ({ ...c, t: new Date(c.iso).getTime() }))
    .filter((c) => c.t > now)
    .sort((a, b) => a.t - b.t)
  if (candidates.length === 0) return { kind: 'closed' }
  return { kind: 'open', cutoffAt: candidates[0].iso, timeZone: candidates[0].timeZone }
}
