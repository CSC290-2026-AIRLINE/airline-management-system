import { Transform } from 'class-transformer'
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator'
import { COMPLAINT_TYPES, EMPLOYEE_LOCATIONS, FLIGHT_ISSUES, FOOD_ISSUES, type ComplaintType } from '../customer-service.constants'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
// Flight numbers are stored both as 'FY 204' and 'FY204', so spaces are dropped here and ignored in the lookup.
const flightNumber = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value)
const upperTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value)

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

  // Optional fields when submitted from the unified form
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MaxLength(12)
  booking_reference?: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  surname?: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  contact_email?: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  contact_phone?: string
}

/**
 * Payload for a passenger without an account ("I'm a passenger without an account").
 * Verified against booking_passenger (booking.booking_reference + passenger.last_name)
 * and stored in complaint_case with customer_id = NULL and booking_passenger_id set.
 */
export class CreateGuestComplaintDto extends CreateComplaintDto {
  @Transform(upperTrim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  declare booking_reference: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  declare surname: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  declare contact_email?: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  declare contact_phone?: string
}
