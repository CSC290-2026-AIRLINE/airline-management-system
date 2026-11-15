import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import { CASE_STATUSES, type CaseStatus } from '../customer-service.constants'

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)

export class AssignCaseOwnerDto {
  @IsUUID()
  @IsNotEmpty()
  staffId!: string
}

export class UpdateCaseStatusDto {
  @IsIn(CASE_STATUSES)
  status!: CaseStatus

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  resolutionNote?: string
}

export class AddCaseNoteDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string
}

export class DecideCompensationDto {
  @IsIn(['voucher', 'refund'] as const)
  type!: 'voucher' | 'refund'

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string

  @IsOptional()
  @IsString()
  sentAt?: string
}

export class UpdateNotificationTemplateDto {
  @IsIn(['email', 'sms', 'push'] as const)
  channel!: 'email' | 'sms' | 'push'

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  subjectTemplate?: string

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  bodyTemplate?: string
}
