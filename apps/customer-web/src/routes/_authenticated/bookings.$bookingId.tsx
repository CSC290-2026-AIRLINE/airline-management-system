import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BookingDetailsPage } from '../../features/onboard-products/BookingDetailsPage'

export const Route = createFileRoute('/_authenticated/bookings/$bookingId')({
  component: BookingsBookingIdRoute,
})

const ONE_SHOT_NOTICE_KEY = 'f12:order-confirmed'

function BookingsBookingIdRoute() {
  const { bookingId } = Route.useParams()
  // Dev-only presets. Visit
  //   `/bookings/:id?preset=confirmed`         → Page 8 (3 orders + green success notice)
  //   `/bookings/:id?preset=cancel-po-2041`    → Page 9 (cancel dialog open over PO-2041)
  //   `/bookings/:id?preset=refund-requested`  → Page 10 (2 orders, PO-2041 cancelled + refund notice)
  // The page itself reads this via `window.location.search` so the
  // type stays loose (TanStack Router's typed search params would
  // force every `<Link to="/bookings/$bookingId">` to pass a `search` prop).
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const presetRaw = searchParams?.get('preset') ?? null
  const preset: 'ready' | 'duty-free' | 'waiting' | 'failed' | 'confirmed' | 'cancel-po-2041' | 'refund-requested' | undefined =
    presetRaw === 'ready' ||
    presetRaw === 'duty-free' ||
    presetRaw === 'waiting' ||
    presetRaw === 'failed' ||
    presetRaw === 'confirmed' ||
    presetRaw === 'cancel-po-2041' ||
    presetRaw === 'refund-requested'
      ? presetRaw
      : undefined
  // One-shot "order just paid" notification. The shop page's
  // "View it in your booking details" button stashes the real order
  // id in `sessionStorage` before navigating here. We read it on
  // first mount and clear the entry in a `useEffect`, so a page
  // refresh, a back-then-forward, or any later visit won't re-show
  // the green "Order PO-XXXX confirmed…" banner. The Figma's banner
  // is a transient success toast, not a persistent state.
  //
  // React 19 StrictMode invokes the `useState` initializer twice in
  // dev. That's safe here because the read is idempotent (both
  // invocations return the same value while the entry exists), and
  // the clear lives in the effect — not the initializer — so the
  // second invocation never sees an empty store. (The earlier IIFE
  // read+clear pattern failed because the first invocation cleared
  // the entry and the second invocation read `null`.)
  //
  // We deliberately do NOT use a `?notice=…` query param for this:
  // a URL param persists across reloads, so the banner would re-appear
  // on every visit until the user manually strips the param.
  //
  // The dev `?preset=confirmed` URL still works — it falls through to
  // the seeded `PO-2052` literal so the Figma diff stays expressible.
  const [oneShotNotice] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.sessionStorage.getItem(ONE_SHOT_NOTICE_KEY)
    } catch {
      return null
    }
  })
  useEffect(() => {
    if (oneShotNotice === null) return
    try {
      window.sessionStorage.removeItem(ONE_SHOT_NOTICE_KEY)
    } catch {
      // best-effort; a leftover entry is harmless because the next
      // booking-page mount will re-read it (and clear it again).
    }
  }, [oneShotNotice])
  const noticeOrderId = oneShotNotice ?? (preset === 'confirmed' ? 'PO-2052' : null)
  return <BookingDetailsPage bookingId={bookingId} preset={preset} noticeOrderId={noticeOrderId} />
}
