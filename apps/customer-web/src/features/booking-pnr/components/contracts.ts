import type { HoldBookingRequest, HoldBookingResponse, SeatDefinition, ServiceCode } from '../api/types'

export type HoldBooking = (input: HoldBookingRequest, idempotencyKey: string) => Promise<HoldBookingResponse>

export interface SeatPickerProps {
  seats: SeatDefinition[]
  currency: string
  selectedSeatCode: string | null
  disabledSeatCodes?: string[]
  passengerLabel?: string
  onSelect: (seatCode: string) => void
}

export interface AssistanceValue {
  serviceCode: ServiceCode | null
  note: string
}

export interface AssistanceFieldsProps {
  value: AssistanceValue
  onChange: (value: AssistanceValue) => void
  disabled?: boolean
}

export interface SeatTakenDialogProps {
  open: boolean
  seatCode: string | null
  onChooseAnother: () => void
  onClose: () => void
}

export interface PriceChangedDialogProps {
  open: boolean
  previousTotal: number
  newTotal: number
  currency: string
  onContinue: () => void
  onCancel: () => void
}
