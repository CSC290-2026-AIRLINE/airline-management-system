// Page composition for `/_authenticated/bookings/$bookingId`. Owns the
// booking fetch; renders the F3b shell and the Feature 12 section
// underneath.

import { useEffect, useState } from 'react'
import { useAppAuth } from '../../auth/AuthProvider'
import { fetchBooking } from './api'
import { BookingShell } from './BookingShell'
import { CustomerNav } from './CustomerNav'
import { ExtraServicesSection } from './ExtraServicesSection'
import { OrderConfirmedNotice } from './OrderConfirmedNotice'
import type { Booking } from './types'

interface Props {
  bookingId: string
  preset?: 'ready' | 'duty-free' | 'waiting' | 'failed' | 'confirmed' | 'cancel-po-2041' | 'refund-requested' | undefined
  noticeOrderId: string | null
}

type State = { kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'success'; booking: Booking }

export function BookingDetailsPage({ bookingId, preset, noticeOrderId }: Props) {
  const { fetchWithAuth, isLoading: isAuthLoading } = useAppAuth()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (isAuthLoading) return
    let cancelled = false
    fetchBooking(bookingId, fetchWithAuth)
      .then((b) => {
        if (cancelled) return
        setState({ kind: 'success', booking: b })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          error: e instanceof Error ? e.message : 'Failed to load booking',
        })
      })
    return () => {
      cancelled = true
    }
  }, [bookingId, fetchWithAuth, isAuthLoading])

  if (state.kind === 'loading') {
    return (
      <div className="block w-full max-w-[1440px] mx-auto px-[45px] pt-6 pb-24 box-border text-left text-foreground font-sans">
        <CustomerNav />
        <p className="py-12 text-center text-muted-foreground">Loading booking…</p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="block w-full max-w-[1440px] mx-auto px-[45px] pt-6 pb-24 box-border text-left text-foreground font-sans">
        <CustomerNav />
        <p className="text-[#b42318] bg-[#fff3f2] border border-[#fdb5b0] rounded-lg px-4 py-3 my-4 text-sm leading-[1.45]" role="alert">
          {state.error}
        </p>
      </div>
    )
  }

  return (
    <div className="block w-full max-w-[1440px] mx-auto px-[45px] pt-6 pb-24 box-border text-left text-foreground font-sans">
      <CustomerNav />
      <OrderConfirmedNotice orderId={noticeOrderId} />
      <BookingShell booking={state.booking} />
      <ExtraServicesSection
        booking={state.booking}
        preset={preset}
        initialCancelTarget={preset === 'cancel-po-2041' ? 'PO-2041' : null}
        refundIdHint={preset === 'refund-requested' ? 'RF-3001' : null}
      />
    </div>
  )
}
