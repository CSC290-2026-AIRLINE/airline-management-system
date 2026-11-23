import { IsNotEmpty, IsString, IsUUID } from 'class-validator'
import type { SickCallInput } from '@backend/modules/crew-rostering/fix-publish/fix-publish.service'
import { Trim } from '@backend/modules/crew-rostering/dto/validation'

/** `POST breaks/:breakId/swap`: who goes on the seat. */
export class SwapDto {
  @IsUUID('all', { message: 'replacementId must be a UUID' })
  replacementId!: string
}

/** `POST breaks/:breakId/override`. The reason is mandatory: it is the audit record. */
export class OverrideDto {
  @Trim()
  @IsString({ message: 'reason is required' })
  @IsNotEmpty({ message: 'reason is required' })
  reason!: string
}

/** `POST runs/:rosterRunId/sick-calls`: who comes off which leg, and why. */
export class SickCallDto implements SickCallInput {
  @IsUUID('all', { message: 'legId must be a UUID' })
  legId!: string

  @IsUUID('all', { message: 'memberId must be a UUID' })
  memberId!: string

  @Trim()
  @IsString({ message: 'reason is required' })
  @IsNotEmpty({ message: 'reason is required' })
  reason!: string
}
