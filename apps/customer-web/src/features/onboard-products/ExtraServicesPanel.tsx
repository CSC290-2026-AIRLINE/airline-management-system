// Feature 12's part of the booking detail page (F3b): the Extra services card and the Your orders list.
// F3b owns the page; this panel reads the booking it already loaded and sells meals, snacks and duty-free for it.

import { useEffect, useMemo, useState } from 'react'
import type { BookingDetail } from '../booking-pnr/api/types'
import { toShopBooking } from './api'
import { ExtraServicesSection } from './ExtraServicesSection'
import { OrderConfirmedNotice } from './OrderConfirmedNotice'

const ONE_SHOT_NOTICE_KEY = 'f12:order-confirmed'

export function ExtraServicesPanel({ booking }: { booking: BookingDetail }) {
  const shopBooking = useMemo(() => toShopBooking(booking), [booking])

  // The shop page stashes the id of the order that was just paid; the banner shows once and is cleared after the first
  // render, so a reload or a later visit does not show it again.
  const [noticeOrderId] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(ONE_SHOT_NOTICE_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (noticeOrderId === null) return
    try {
      window.sessionStorage.removeItem(ONE_SHOT_NOTICE_KEY)
    } catch {
      // A leftover entry is harmless: the next visit reads and clears it.
    }
  }, [noticeOrderId])

  return (
    <div className="space-y-4">
      <OrderConfirmedNotice orderId={noticeOrderId} />
      <ExtraServicesSection booking={shopBooking} />
    </div>
  )
}
