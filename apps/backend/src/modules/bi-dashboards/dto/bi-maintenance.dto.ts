import { IsDateString, IsIn } from 'class-validator'

/** The maintenance types Feature 9 accepts. Kept here so this module does not import another team's DTO file. */
export const BI_MAINTENANCE_TYPES = ['a_check', 'b_check', 'c_check', 'd_check', 'unscheduled'] as const

/** Input for "Mark for maintenance" on the Aircraft use page. The dates are the planned window, inclusive. */
export class CreateBiMaintenanceDto {
  @IsIn(BI_MAINTENANCE_TYPES)
  maintenance_type!: (typeof BI_MAINTENANCE_TYPES)[number]

  @IsDateString()
  planned_start_date!: string

  @IsDateString()
  planned_end_date!: string
}
