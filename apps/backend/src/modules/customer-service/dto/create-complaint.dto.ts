import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateBy, ValidateIf } from 'class-validator'
import { COMPLAINT_TYPES, EMPLOYEE_LOCATIONS, FLIGHT_ISSUES, FOOD_ISSUES, type ComplaintType } from '../customer-service.constants'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
// Flight numbers are stored both as 'FY 204' and 'FY204', so spaces are dropped here and ignored in the lookup.
const flightNumber = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value)
const upperTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value)

/** A YYYY-MM-DD string that names a real day, so '2026-02-30' is a 400 here instead of a 500 from Postgres's ::date cast. */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export class CreateComplaintDto {
  @IsIn(COMPLAINT_TYPES)
  type!: ComplaintType

  // Employee complaints only.
  @ValidateIf((o: CreateComplaintDto) => o.type === 'employee')
  @IsIn(EMPLOYEE_LOCATIONS)
  location?: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  staff_name?: string

  // Flight and food complaints require flight_number & service_date; employee complaints may optionally supply them.
  @ValidateIf((o: CreateComplaintDto) => o.type !== 'employee' || Boolean(o.flight_number))
  @Transform(flightNumber)
  @Matches(/^[A-Z0-9]{2,8}$/, { message: 'flight_number must be 2–8 letters or digits' })
  flight_number?: string

  @ValidateIf((o: CreateComplaintDto) => o.type !== 'employee' || Boolean(o.service_date))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'service_date must be YYYY-MM-DD' })
  @ValidateBy({ name: 'isCalendarDate', validator: { validate: isCalendarDate, defaultMessage: () => 'service_date must be a real date' } })
  service_date?: string

  // Which list applies depends on the type; the service checks that.
  @ValidateIf((o: CreateComplaintDto) => o.type !== 'employee')
  @IsIn([...new Set([...FLIGHT_ISSUES, ...FOOD_ISSUES])])
  issue?: string

  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  description!: string

  // Optional: narrows the check that the flight is on one of the customer's own bookings.
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MaxLength(12)
  booking_reference?: string
}
