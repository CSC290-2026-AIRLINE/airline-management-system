import { useEffect, useRef, useState } from 'react'
import { useBookingPnrApi, type ApiError } from '../api/client'
import type { BookingDetail, CancelBookingResult, CancelPreview } from '../api/types'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { Dialog } from '../components/Dialog'
import { toApiError } from '../lib/errors'
import { formatMoney } from '../lib/format'
import controls from '../styles/controls.module.css'
import { seatCount } from './booking-detail-model'
import styles from './CancelBookingDialog.module.css'

interface CancelBookingDialogProps {
  booking: BookingDetail
  onClose: () => void
  onCancelled: (result: CancelBookingResult) => void
}

/**
 * The cancel overlay of a confirmed booking (frame 08a) and of an unpaid hold (frame 05a). The fee and the refund come
 * from the cancellation preview. A booking that a passenger has already checked in is closed: the cancel route answers
 * 409 BOOKING_CLOSED and the dialog says so instead of the fee.
 *
 * The page mounts the dialog only while it is open, so every open starts with a fresh preview.
 */
export function CancelBookingDialog({ booking, onClose, onCancelled }: CancelBookingDialogProps) {
  const api = useBookingPnrApi()
  const apiRef = useRef(api)
  const [preview, setPreview] = useState<CancelPreview | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(true)
  const [isCancelling, setIsCancelling] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  // A passenger has checked in, so the booking can no longer be cancelled.
  const [isClosed, setIsClosed] = useState(false)

  useEffect(() => {
    apiRef.current = api
  }, [api])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const result = await apiRef.current.getCancelPreview(booking.reference)
        if (!cancelled) {
          setPreview(result)
        }
      } catch (caught) {
        if (cancelled) {
          return
        }
        const apiError = toApiError(caught)
        if (apiError.code === 'BOOKING_CLOSED') {
          setIsClosed(true)
        } else {
          setError(apiError)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPreview(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [booking.reference])

  async function handleConfirm() {
    setIsCancelling(true)
    setError(null)

    try {
      const result = await apiRef.current.cancelBooking(booking.reference)
      onCancelled(result)
    } catch (caught) {
      const apiError = toApiError(caught)
      if (apiError.code === 'BOOKING_CLOSED') {
        setIsClosed(true)
      } else {
        setError(apiError)
      }
    } finally {
      setIsCancelling(false)
    }
  }

  const unpaid = booking.status === 'held'
  const seats = seatCount(booking)

  return (
    <Dialog
      open
      title={unpaid ? 'Cancel this booking?' : `Cancel booking ${booking.reference}?`}
      description={
        unpaid
          ? `Booking ${booking.reference} has not been paid. Cancelling releases your ${seats} held seat${seats === 1 ? '' : 's'} and the booking is closed. Nothing is charged.`
          : `${flightsCopy(booking.segments.length)} and all ${seats} seat${seats === 1 ? '' : 's'} will be released. This cannot be undone.`
      }
      onClose={() => {
        if (!isCancelling) {
          onClose()
        }
      }}
      footer={
        // The fee is only known once the preview has answered, so the booking can only be cancelled from there on.
        isClosed || !preview ? (
          <button type="button" className={controls.secondary} onClick={onClose}>
            Keep booking
          </button>
        ) : (
          <>
            <button type="button" className={controls.secondary} onClick={onClose} disabled={isCancelling}>
              Keep booking
            </button>
            <button type="button" className={controls.danger} onClick={() => void handleConfirm()} disabled={isCancelling}>
              {isCancelling ? 'Cancelling…' : unpaid ? 'Yes, cancel' : 'Cancel booking'}
            </button>
          </>
        )
      }
    >
      {isClosed ? (
        <p className={styles.closed}>This booking can no longer be cancelled because a passenger has already checked in.</p>
      ) : null}

      {isLoadingPreview ? <p className={styles.loading}>Working out the fee and the refund…</p> : null}

      {error ? <ApiErrorBanner error={error} /> : null}

      {preview && !unpaid ? (
        <table className={styles.table}>
          <tbody>
            <tr>
              <td>Total paid</td>
              <td>{formatMoney(booking.total, preview.currency || booking.currency)}</td>
            </tr>
            <tr>
              <td>Cancellation fee</td>
              <td className={styles.fee}>− {formatMoney(preview.fee, preview.currency || booking.currency)}</td>
            </tr>
            <tr>
              <td>{booking.paymentType === 'miles' ? 'Miles returned' : 'Refund to card'}</td>
              <td className={styles.refund}>
                {booking.paymentType === 'miles' && preview.milesReturned !== null && preview.milesReturned !== undefined
                  ? `${preview.milesReturned} miles`
                  : formatMoney(preview.refund, preview.currency || booking.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : null}

      {preview && !unpaid ? (
        <p className={styles.note}>
          The fee comes from the fare rules in pricing (feature 4). The refund is processed by refunds (feature 5b) and shown in your
          booking.
        </p>
      ) : null}
    </Dialog>
  )
}

/** "Both flights" for a return trip, "All 3 flights" for a longer one. */
function flightsCopy(count: number): string {
  if (count === 2) {
    return 'Both flights'
  }
  return `All ${count} flight${count === 1 ? '' : 's'}`
}
