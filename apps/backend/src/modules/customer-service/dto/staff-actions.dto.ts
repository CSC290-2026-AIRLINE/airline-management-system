import { Transform } from 'class-transformer'
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { CASE_STATUSES, type CaseStatus } from '../customer-service.constants'

export class UpdateCaseStatusDto {
  @IsIn(CASE_STATUSES)
  status!: CaseStatus
}

export class AddCaseNoteDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string
}
