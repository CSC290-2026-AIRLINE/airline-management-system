import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class PromoQuotesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  code!: string
}
