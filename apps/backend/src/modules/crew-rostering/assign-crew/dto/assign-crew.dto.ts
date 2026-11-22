import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator'

/** `POST runs/:rosterRunId/auto-assign`. An empty or missing list crews the whole run. */
export class AutoAssignDto {
  @IsOptional()
  @IsArray({ message: 'pairingIds must be an array' })
  @IsUUID('all', { each: true, message: 'pairingIds must be UUIDs' })
  pairingIds: string[] = []
}

/** `?demoBreaks=true` lets the dice plant rule breaks for Ops to fix, for demos. */
export class AutoAssignQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'demoBreaks must be true or false' })
  demoBreaks?: 'true' | 'false'
}
