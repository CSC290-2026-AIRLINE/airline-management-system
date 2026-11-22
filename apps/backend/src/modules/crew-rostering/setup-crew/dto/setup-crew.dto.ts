import { Transform } from 'class-transformer'
import { IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'
import {
  CREW_ROLES,
  type CertificationInput,
  type CrewListQuery,
  type CrewProfileInput,
  type CrewRole,
} from '@backend/modules/crew-rostering/setup-crew/setup-crew.service'
import { BlankToNull, IsCalendarDate, LowerEach, Trim, TrimUpper } from '@backend/modules/crew-rostering/dto/validation'

const ROLE_MESSAGE = `role must be one of ${CREW_ROLES.join(', ')}`

/** `all` (the filter's "All" option) and blank both mean no filter. */
const AllToUndefined = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value !== 'string' || value.trim() === '' || value === 'all' ? undefined : value.trim()))

/** `GET crew?search=&base=&role=`. Every filter is optional. */
export class ListCrewQueryDto implements CrewListQuery {
  @IsOptional()
  @AllToUndefined()
  @IsString()
  search?: string

  @IsOptional()
  @AllToUndefined()
  @IsString()
  base?: string

  @IsOptional()
  @AllToUndefined()
  @IsIn(CREW_ROLES, { message: ROLE_MESSAGE })
  role?: CrewRole
}

/** The whole crew profile form, for create and for update. */
export class CrewProfileDto implements CrewProfileInput {
  @Trim()
  @IsString({ message: 'firstName is required' })
  @IsNotEmpty({ message: 'firstName is required' })
  firstName!: string

  @Trim()
  @IsString({ message: 'lastName is required' })
  @IsNotEmpty({ message: 'lastName is required' })
  lastName!: string

  @Trim()
  @IsString({ message: 'employeeNo is required' })
  @IsNotEmpty({ message: 'employeeNo is required' })
  employeeNo!: string

  @Trim()
  @IsIn(CREW_ROLES, { message: ROLE_MESSAGE })
  role!: CrewRole

  @TrimUpper()
  @IsString({ message: 'base is required' })
  @IsNotEmpty({ message: 'base is required' })
  base!: string

  @Trim()
  @IsString({ message: 'fleet is required' })
  @IsNotEmpty({ message: 'fleet is required' })
  fleet!: string

  @Transform(({ value }) => value ?? [])
  @LowerEach()
  @IsArray({ message: 'languages must be an array of codes' })
  @Matches(/^[a-z]{2}$/, { each: true, message: 'languages must be 2-letter language codes' })
  languages: string[] = []

  @Trim()
  @IsString({ message: 'licenceNumber is required' })
  @IsNotEmpty({ message: 'licenceNumber is required' })
  licenceNumber!: string

  @IsCalendarDate()
  licenceExpiresOn!: string

  @BlankToNull()
  @IsOptional()
  @IsCalendarDate()
  dateOfBirth: string | null = null

  @BlankToNull()
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  email: string | null = null

  @BlankToNull()
  @IsOptional()
  @IsString({ message: 'phone must be a string' })
  phone: string | null = null
}

/** A type rating or mandatory certification on a crew profile. */
export class CertificationDto implements CertificationInput {
  @Trim()
  @IsString({ message: 'name is required' })
  @IsNotEmpty({ message: 'name is required' })
  name!: string

  @BlankToNull()
  @IsOptional()
  @IsString({ message: 'aircraftType must be a string' })
  aircraftType: string | null = null

  @IsCalendarDate()
  expiresOn!: string
}
