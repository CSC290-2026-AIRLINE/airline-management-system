import { Transform } from 'class-transformer'
import { IsIn, IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from 'class-validator'

export const PASSENGER_DELIVERY_TYPES = ['home', 'hotel', 'other_address', 'airport_pickup'] as const
export type PassengerDeliveryType = (typeof PASSENGER_DELIVERY_TYPES)[number]

export class PassengerDeliveryChoiceDto {
  @IsIn(PASSENGER_DELIVERY_TYPES)
  deliveryType!: PassengerDeliveryType

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((choice: PassengerDeliveryChoiceDto) => choice.deliveryType !== 'airport_pickup' || choice.address !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @ValidateIf((choice: PassengerDeliveryChoiceDto) => choice.deliveryType === 'airport_pickup' || choice.pickupAirport !== undefined)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  pickupAirport?: string
}
