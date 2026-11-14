import { useEffect, useRef } from 'react'
import type { SeatTakenDialogProps } from '../components/contracts'
import controls from '../styles/controls.module.css'
import './seat-taken-dialog.css'

export function SeatTakenDialog({ open, seatCode, onChooseAnother, onClose }: SeatTakenDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      className="seat-taken-dialog"
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      aria-labelledby="seat-taken-title"
    >
      <span className="seat-taken-dialog__code">409 SEAT_UNAVAILABLE</span>
      <h2 id="seat-taken-title">That seat was just taken</h2>
      <p>{seatCode ? `Seat ${seatCode} is no longer available.` : 'This seat is no longer available.'} Please choose another seat.</p>
      <div className="seat-taken-dialog__actions">
        <button className={controls.secondary} type="button" onClick={onClose}>
          Close
        </button>
        <button className={controls.primary} type="button" onClick={onChooseAnother}>
          Pick another seat
        </button>
      </div>
    </dialog>
  )
}
