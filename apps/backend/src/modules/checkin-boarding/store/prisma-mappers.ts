import type { CheckInStatus } from '../api-types'
import type {
  BoardingEventRecord,
  BoardingPassRecord,
  CarryOnCheckRecord,
  CheckedBagRecord,
  CheckInRecord,
  CreateDocumentInput,
  FlightBoardingRecord,
  GateRecord,
  TravelDocumentRecord,
  UpdateBagPatch,
  UpdateDocumentPatch,
} from './checkin-store'

/** Prisma hands NUMERIC columns over as Decimal; the records keep plain numbers. */
export type Numeric = number | string | { toString(): string }

const num = (value: Numeric): number => Number(value)

/** The passport expiry is a DATE column; the record keeps the plain ISO day, like the in-memory store. */
export const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10)

/** The write side: the record keeps 'YYYY-MM-DD', the column wants a date. */
export const fromIsoDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

export interface CheckInRow {
  id: string
  booking_passenger_id: string
  passenger_id: string
  flight_id: string
  status: string
  declared_bags: number | null
  screening_run_id: string | null
  checked_in_at: Date | null
  created_at: Date
  updated_at: Date
}

export function toCheckInRecord(row: CheckInRow): CheckInRecord {
  return {
    id: row.id,
    booking_passenger_id: row.booking_passenger_id,
    passenger_id: row.passenger_id,
    flight_id: row.flight_id,
    status: row.status as CheckInStatus,
    declared_bags: row.declared_bags,
    screening_run_id: row.screening_run_id,
    checked_in_at: row.checked_in_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export interface DocumentRow {
  id: string
  check_in_id: string
  doc_type: string
  number_last4: string
  issuing_country: string
  nationality: string | null
  expiry_date: Date
  visa_number: string | null
  visa_checked_by: string | null
  visa_checked_at: Date | null
  name_mismatch: boolean
  name_mismatch_cleared_by: string | null
  name_mismatch_cleared_at: Date | null
  profile_differences: string[]
  profile_differences_cleared_by: string | null
  profile_differences_cleared_at: Date | null
  created_at: Date
  updated_at: Date
}

export function toDocumentRecord(row: DocumentRow): TravelDocumentRecord {
  return {
    id: row.id,
    check_in_id: row.check_in_id,
    doc_type: row.doc_type as 'P',
    number_last4: row.number_last4,
    issuing_country: row.issuing_country,
    nationality: row.nationality,
    expiry_date: toIsoDate(row.expiry_date),
    visa_number: row.visa_number,
    visa_checked_by: row.visa_checked_by,
    visa_checked_at: row.visa_checked_at,
    name_mismatch: row.name_mismatch,
    name_mismatch_cleared_by: row.name_mismatch_cleared_by,
    name_mismatch_cleared_at: row.name_mismatch_cleared_at,
    profile_differences: row.profile_differences,
    profile_differences_cleared_by: row.profile_differences_cleared_by,
    profile_differences_cleared_at: row.profile_differences_cleared_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export interface BagRow {
  id: string
  check_in_id: string
  tag_number: string | null
  weight_kg: Numeric
  excess_kg: Numeric
  rate_per_kg: Numeric
  excess_fee: Numeric
  excess_payment_id: string | null
  status: string
  weighed_by: string | null
  weighed_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export function toBagRecord(row: BagRow): CheckedBagRecord {
  return {
    id: row.id,
    check_in_id: row.check_in_id,
    tag_number: row.tag_number,
    weight_kg: num(row.weight_kg),
    excess_kg: num(row.excess_kg),
    rate_per_kg: num(row.rate_per_kg),
    excess_fee: num(row.excess_fee),
    excess_payment_id: row.excess_payment_id,
    status: row.status as CheckedBagRecord['status'],
    weighed_by: row.weighed_by,
    weighed_at: row.weighed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  }
}

export interface CarryOnRow {
  id: string
  check_in_id: string
  weight_kg: Numeric
  within_size: boolean
  result: string
  staff_id: string | null
  checked_at: Date
  created_at: Date
}

export function toCarryOnRecord(row: CarryOnRow): CarryOnCheckRecord {
  return {
    id: row.id,
    check_in_id: row.check_in_id,
    weight_kg: num(row.weight_kg),
    within_size: row.within_size,
    result: row.result as CarryOnCheckRecord['result'],
    staff_id: row.staff_id,
    checked_at: row.checked_at,
    created_at: row.created_at,
  }
}

export interface FlightBoardingRow {
  flight_id: string
  gate_id: string
  sensor_count: number | null
  manual_count: number | null
  boarded_count: number | null
  closed_at: Date | null
  closed_by: string | null
  created_at: Date
  updated_at: Date
}

export function toFlightBoardingRecord(row: FlightBoardingRow): FlightBoardingRecord {
  return {
    flight_id: row.flight_id,
    gate_id: row.gate_id,
    sensor_count: row.sensor_count,
    manual_count: row.manual_count,
    boarded_count: row.boarded_count,
    closed_at: row.closed_at,
    closed_by: row.closed_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export interface PassRow {
  id: string
  check_in_id: string
  reference: string
  seat_code: string
  boarding_group: number
  printed_at: Date | null
  created_at: Date
  updated_at: Date
}

export function toPassRecord(row: PassRow): BoardingPassRecord {
  return {
    id: row.id,
    check_in_id: row.check_in_id,
    reference: row.reference,
    seat_code: row.seat_code,
    boarding_group: row.boarding_group,
    printed_at: row.printed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export interface EventRow {
  id: string
  flight_id: string
  gate_id: string
  boarding_pass_id: string | null
  scanned_reference: string | null
  event: string
  reason: string | null
  staff_id: string | null
  occurred_at: Date
  created_at: Date
}

export function toEventRecord(row: EventRow): BoardingEventRecord {
  return {
    id: row.id,
    flight_id: row.flight_id,
    gate_id: row.gate_id,
    boarding_pass_id: row.boarding_pass_id,
    scanned_reference: row.scanned_reference,
    event: row.event as BoardingEventRecord['event'],
    reason: row.reason,
    staff_id: row.staff_id,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
  }
}

export interface GateRow {
  id: string
  airport_code: string
  code: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}

export function toGateRecord(row: GateRow): GateRecord {
  return {
    id: row.id,
    airport_code: row.airport_code,
    code: row.code,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** The columns a new travel document is written with. */
export interface DocumentCreate {
  check_in_id: string
  doc_type: string
  number_last4: string
  issuing_country: string
  nationality: string | null
  expiry_date: Date
  visa_number: string | null
  name_mismatch: boolean
  profile_differences: string[]
}

export function fromDocumentInput(input: CreateDocumentInput): DocumentCreate {
  return {
    check_in_id: input.check_in_id,
    doc_type: 'P',
    number_last4: input.number_last4,
    issuing_country: input.issuing_country,
    nationality: input.nationality ?? null,
    expiry_date: fromIsoDate(input.expiry_date),
    visa_number: input.visa_number ?? null,
    name_mismatch: input.name_mismatch ?? false,
    profile_differences: input.profile_differences ?? [],
  }
}

/** The columns a travel document may change. The repository overwrites updated_at with the clock. */
export interface DocumentWrite {
  doc_type?: string
  number_last4?: string
  issuing_country?: string
  nationality?: string | null
  expiry_date?: Date
  visa_number?: string | null
  visa_checked_by?: string | null
  visa_checked_at?: Date | null
  name_mismatch?: boolean
  name_mismatch_cleared_by?: string | null
  name_mismatch_cleared_at?: Date | null
  profile_differences?: string[]
  profile_differences_cleared_by?: string | null
  profile_differences_cleared_at?: Date | null
  updated_at?: Date
}

export function fromDocumentPatch(patch: UpdateDocumentPatch): DocumentWrite {
  const { expiry_date, ...rest } = patch
  return { ...rest, ...(expiry_date ? { expiry_date: fromIsoDate(expiry_date) } : {}) }
}

/** The columns a checked bag may change. The repository overwrites updated_at with the clock. */
export interface BagWrite {
  tag_number?: string | null
  weight_kg?: number
  excess_kg?: number
  rate_per_kg?: number
  excess_fee?: number
  excess_payment_id?: string | null
  status?: CheckedBagRecord['status']
  weighed_by?: string
  weighed_at?: Date
  deleted_at?: Date | null
  updated_at?: Date
}

export function fromBagPatch(patch: UpdateBagPatch): BagWrite {
  const { weighed_by, weighed_at, ...rest } = patch
  // The columns are NOT NULL, so a bag without a staff member or a weighing time keeps the ones it has.
  return { ...rest, ...(weighed_by ? { weighed_by } : {}), ...(weighed_at ? { weighed_at } : {}) }
}
