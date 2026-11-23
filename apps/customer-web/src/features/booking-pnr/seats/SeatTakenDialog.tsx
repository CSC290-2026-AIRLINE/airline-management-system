import type { SeatTakenDialogProps } from '../components/contracts'
import { Button } from '@customer-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@customer-web/components/ui/dialog'

export function SeatTakenDialog({ open, seatCode, onChooseAnother, onClose }: SeatTakenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="text-left sm:max-w-md">
        <DialogHeader>
          <span className="w-fit rounded-md border border-danger/25 bg-danger/10 px-2 py-0.5 font-mono text-xs text-danger">
            409 SEAT_UNAVAILABLE
          </span>
          <DialogTitle>That seat was just taken</DialogTitle>
          <DialogDescription>
            {seatCode ? `Seat ${seatCode} is no longer available.` : 'This seat is no longer available.'} Please choose another seat.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={onChooseAnother}>
            Pick another seat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
