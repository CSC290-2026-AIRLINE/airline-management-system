import { useEffect, useRef } from 'react'
import type { SeatTakenDialogProps } from '../components/contracts'
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
      <h2 id="seat-taken-title">That seat was just taken</h2>
      <p>{seatCode ? `Seat ${seatCode} is no longer available.` : 'This seat is no longer available.'} Please choose another seat.</p>
      <div className="seat-taken-dialog__actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button type="button" onClick={onChooseAnother}>
          Pick another seat
        </button>
      </div>
    </dialog>
  )
}
