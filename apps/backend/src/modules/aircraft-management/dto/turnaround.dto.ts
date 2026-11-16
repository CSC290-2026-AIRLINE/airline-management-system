import { Type } from 'class-transformer'
import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, ValidateNested } from 'class-validator'

export const TURNAROUND_TASK_TYPES = ['refuel', 'cleaning', 'catering', 'inspection'] as const
export type TurnaroundTaskType = (typeof TURNAROUND_TASK_TYPES)[number]

export const TURNAROUND_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const
export type TurnaroundTaskStatus = (typeof TURNAROUND_TASK_STATUSES)[number]

export class TurnaroundTaskInputDto {
  @IsIn(TURNAROUND_TASK_TYPES)
  task_type!: TurnaroundTaskType
}

export class CreateTurnaroundDto {
  @IsUUID()
  flight_id!: string

  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'airport_code must be a 3-letter IATA code' })
  airport_code!: string

  @IsDateString()
  arrived_at!: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurnaroundTaskInputDto)
  tasks?: TurnaroundTaskInputDto[]
}

export class UpdateTaskStatusDto {
  @IsIn(TURNAROUND_TASK_STATUSES)
  status!: TurnaroundTaskStatus

  @IsOptional()
  @IsDateString()
  started_at?: string

  @IsOptional()
  @IsDateString()
  completed_at?: string
}
