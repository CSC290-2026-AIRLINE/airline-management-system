import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** Body of `POST /api/staff/bag-matches/:id/confirm`. The note says what staff checked. */
export class ConfirmBagMatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note: string
}

/** Body of `POST /api/staff/bag-matches/:id/reject`. */
export class RejectBagMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string
}
