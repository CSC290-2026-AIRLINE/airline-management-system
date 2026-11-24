import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator'

export class NotificationPreferenceItemDto {
  @IsString()
  typeCode: string

  @IsBoolean()
  email: boolean

  @IsBoolean()
  sms: boolean

  @IsBoolean()
  push: boolean
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences: NotificationPreferenceItemDto[]
}

export interface NotificationPreferenceView {
  typeCode: string
  typeName: string
  /** The part of the airline the message comes from, in the customer's words ("Flights", "Baggage"). */
  service: string
  isMandatory: boolean
  /** False when the account has no phone number: SMS cannot be sent, so it cannot be switched on. */
  smsAvailable: boolean
  email: boolean
  sms: boolean
  push: boolean
}
