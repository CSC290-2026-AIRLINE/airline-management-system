import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import type { Cabin, PassengerType, ServiceCode } from '../../contracts'

export class HoldPassengerDto {
  @IsUUID()
  passengerId!: string

  @IsIn(['adult', 'child', 'infant'])
  passengerType!: PassengerType

  @IsOptional()
  @IsUUID()
  lapOfPassengerId?: string | null
}

export class HoldSegmentDto {
  @IsUUID()
  flightId!: string

  @IsIn(['economy', 'premium_economy', 'business', 'first'])
  cabin!: Cabin

  @IsOptional()
  @IsUUID()
  fareClassId!: string | null

  @IsOptional()
  @IsUUID()
  fareQuoteId?: string | null
}

export class HoldSeatDto {
  @IsUUID()
  passengerId!: string

  @IsUUID()
  flightId!: string

  @Matches(/^[1-9][0-9]?[A-Z]$/)
  seatCode!: string
}

export class HoldServiceRequestDto {
  @IsUUID()
  passengerId!: string

  @IsOptional()
  @IsUUID()
  flightId?: string

  @IsIn(['WCHR', 'WCHS', 'WCHC', 'UMNR', 'MEDA'])
  serviceCode!: ServiceCode

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string
}

export class HoldBookingDto {
  @IsIn(['one_way', 'return', 'multi_city'])
  tripType!: 'one_way' | 'return' | 'multi_city'

  @IsIn(['cash', 'miles'])
  paymentType!: 'cash' | 'miles'

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @ValidateNested({ each: true })
  @Type(() => HoldPassengerDto)
  passengers!: HoldPassengerDto[]

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => HoldSegmentDto)
  segments!: HoldSegmentDto[]

  @IsEmail()
  @MaxLength(254)
  contactEmail!: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  promoCode?: string

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(9999999999.99)
  expectedTotal!: number

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(45)
  @ValidateNested({ each: true })
  @Type(() => HoldSeatDto)
  seats?: HoldSeatDto[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(450)
  @ValidateNested({ each: true })
  @Type(() => HoldServiceRequestDto)
  serviceRequests?: HoldServiceRequestDto[]
}

export interface HoldBookingResponse {
  bookingId: string
  reference: string
  total: number
  currency: string
  holdExpiresAt: string
}
