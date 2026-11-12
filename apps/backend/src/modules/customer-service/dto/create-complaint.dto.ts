import { Transform } from 'class-transformer'
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator'
import { COMPLAINT_TYPES, EMPLOYEE_LOCATIONS, FLIGHT_ISSUES, FOOD_ISSUES, type ComplaintType } from '../customer-service.constants'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)
// Flight numbers are stored both as 'FY 204' and 'FY204', so spaces are dropped here and ignored in the lookup.
const flightNumber = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value)

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

  // Flight and food complaints only: the flight is looked up by number and date.
  @ValidateIf((o: CreateComplaintDto) => o.type !== 'employee')
  @Transform(flightNumber)
  @Matches(/^[A-Z0-9]{2,8}$/, { message: 'flight_number must be 2–8 letters or digits' })
  flight_number?: string

  @ValidateIf((o: CreateComplaintDto) => o.type !== 'employee')
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
}
