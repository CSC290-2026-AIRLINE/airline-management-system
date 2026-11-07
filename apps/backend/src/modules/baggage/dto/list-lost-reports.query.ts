import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator'
import { REPORT_STATUSES, type ReportStatus } from '../common/baggage.constants'
import { BAGGAGE_TAG_PATTERN } from '../common/baggage-tag.util'

/** Query of `GET /api/staff/lost-reports`. Every filter is optional; filters combine with AND. */
export class ListLostReportsQuery {
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: ReportStatus

  @IsOptional()
  @IsUUID()
  flightId?: string

  @IsOptional()
  @IsString()
  @Matches(BAGGAGE_TAG_PATTERN, { message: 'tagNumber must be 10 digits starting with 0' })
  tagNumber?: string

  @IsOptional()
  @IsString()
  @Matches(/^LB-[0-9]{4}-[0-9]{6}$/i, { message: 'caseNumber must look like LB-2026-000001' })
  caseNumber?: string
}
