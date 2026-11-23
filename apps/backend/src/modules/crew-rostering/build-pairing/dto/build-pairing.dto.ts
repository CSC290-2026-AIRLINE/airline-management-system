import { Type } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import type { CommitDraft, SaveLegInput } from '@backend/modules/crew-rostering/build-pairing/build-pairing.service'
import { WindowQueryDto } from '@backend/modules/crew-rostering/dto/window-query.dto'
import { Trim } from '@backend/modules/crew-rostering/dto/validation'

/** One flight in a pairing. `addedManually` marks a leg Ops added by hand rather than the generator. */
export class LegDto implements SaveLegInput {
  @IsUUID('all', { message: 'flightId must be a UUID' })
  flightId!: string

  @IsOptional()
  @IsBoolean({ message: 'addedManually must be true or false' })
  addedManually: boolean = false
}

/** `PUT pairings/:pairingId/legs`: the pairing's whole new leg list. */
export class SaveLegsDto {
  @IsArray({ message: 'legs must be an array' })
  @ValidateNested({ each: true })
  @Type(() => LegDto)
  legs!: LegDto[]
}

/** One proposal from Generate, by the ref the page shows (`P-108`). */
export class CommitDraftDto implements CommitDraft {
  @Trim()
  @IsString({ message: 'ref is required' })
  @IsNotEmpty({ message: 'ref is required' })
  ref!: string

  @IsArray({ message: 'legs must be an array' })
  @ArrayNotEmpty({ message: 'a pairing needs at least one flight' })
  @ValidateNested({ each: true })
  @Type(() => LegDto)
  legs!: LegDto[]
}

/** `POST pairings/commit`: the window and the proposals Ops chose. */
export class CommitPairingsDto extends WindowQueryDto {
  @IsArray({ message: 'pairings must be an array' })
  @ValidateNested({ each: true })
  @Type(() => CommitDraftDto)
  pairings!: CommitDraftDto[]
}
