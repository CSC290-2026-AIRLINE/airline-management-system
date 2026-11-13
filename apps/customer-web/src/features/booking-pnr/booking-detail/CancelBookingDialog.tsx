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
  // The booking can no longer be cancelled, because its hold expired while the customer was on the page.
  onInvalidState?: (error: ApiError) => void
}

/**
 * The cancel overlay of a confirmed booking (frame 08a) and of an unpaid hold (frame 05a). The fee and the refund come
 * from the cancellation preview. A booking that a passenger has already checked in is closed: the cancel route answers
 * 409 BOOKING_CLOSED and the dialog says so instead of the fee.
 *
 * The page mounts the dialog only while it is open, so every open starts with a fresh preview.
 */
export function CancelBookingDialog({ booking, onClose, onCancelled, onInvalidState }: CancelBookingDialogProps) {
  const api = useBookingPnrApi()
  const apiRef = useRef(api)
  const unpaid = booking.status === 'held'
  const [preview, setPreview] = useState<CancelPreview | null>(null)
  const [previewAttempt, setPreviewAttempt] = useState(0)
  const [previewError, setPreviewError] = useState<ApiError | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  // A passenger has checked in, so the booking can no longer be cancelled.
  const [isClosed, setIsClosed] = useState(false)
  const onInvalidStateRef = useRef(onInvalidState)

  useEffect(() => {
    apiRef.current = api
  }, [api])

  useEffect(() => {
    onInvalidStateRef.current = onInvalidState
  }, [onInvalidState])

  useEffect(() => {
    let cancelled = false

    if (unpaid) {
      return () => {
        cancelled = true
      }
    }

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
        } else if (apiError.code === 'INVALID_BOOKING_STATE') {
          // The hold expired: the page shows the expired booking instead of a raw error.
          onInvalidStateRef.current?.(apiError)
        } else {
          setPreviewError(apiError)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [booking.reference, previewAttempt, unpaid])

  function handleRetryPreview() {
    setPreview(null)
    setPreviewError(null)
    setPreviewAttempt((attempt) => attempt + 1)
  }

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
      } else if (apiError.code === 'INVALID_BOOKING_STATE') {
        onInvalidStateRef.current?.(apiError)
      } else {
        setError(apiError)
      }
    } finally {
      setIsCancelling(false)
    }
  }

  function handleClose() {
    if (!isCancelling) {
      onClose()
    }
  }

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
      onClose={handleClose}
      footer={
        isClosed ? (
          <button type="button" className={controls.secondary} onClick={handleClose} disabled={isCancelling}>
            Keep booking
          </button>
        ) : (
          <>
            <button type="button" className={controls.secondary} onClick={handleClose} disabled={isCancelling}>
              Keep booking
            </button>
            <button
              type="button"
              className={controls.danger}
              onClick={() => void handleConfirm()}
              disabled={(!unpaid && !preview) || isCancelling}
            >
              {isCancelling ? 'Cancelling…' : unpaid ? 'Yes, cancel' : 'Yes, cancel booking'}
            </button>
          </>
        )
      }
    >
      {isClosed ? (
        <p className={styles.closed}>This booking can no longer be cancelled because a passenger has already checked in.</p>
      ) : null}

      {previewError ? (
        <div className={styles.previewError} role="alert">
          <span>{previewError.message}</span>
          <button type="button" className={styles.retry} onClick={handleRetryPreview}>
            Try again
          </button>
        </div>
      ) : null}

      {error ? <ApiErrorBanner error={error} /> : null}

      {!unpaid && !isClosed ? (
        <table className={styles.table} aria-busy={!preview && !previewError}>
          <tbody>
            <tr>
              <td>Total paid</td>
              <td>
                {preview ? (
                  formatMoney(booking.total, preview.currency || booking.currency)
                ) : (
                  <span className={styles.skeleton} aria-hidden="true" />
                )}
              </td>
            </tr>
            <tr>
              <td>Cancellation fee</td>
              <td className={styles.fee}>
                {preview ? (
                  `− ${formatMoney(preview.fee, preview.currency || booking.currency)}`
                ) : (
                  <span className={styles.skeleton} aria-hidden="true" />
                )}
              </td>
            </tr>
            <tr>
              <td>{booking.paymentType === 'miles' ? 'Miles returned' : 'Refund to card'}</td>
              <td className={styles.refund}>
                {preview ? (
                  booking.paymentType === 'miles' && preview.milesReturned !== null && preview.milesReturned !== undefined ? (
                    `${preview.milesReturned} miles`
                  ) : (
                    formatMoney(preview.refund, preview.currency || booking.currency)
                  )
                ) : (
                  <span className={styles.skeleton} aria-hidden="true" />
                )}
              </td>
            </tr>
          </tbody>
        </table>
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
