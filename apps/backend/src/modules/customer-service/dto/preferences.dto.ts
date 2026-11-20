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
  sourceFeature: string
  isMandatory: boolean
  email: boolean
  sms: boolean
  push: boolean
}
