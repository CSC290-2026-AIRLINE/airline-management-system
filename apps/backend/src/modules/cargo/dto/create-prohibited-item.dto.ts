import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateProhibitedItemDto {
  @IsString()
  @IsNotEmpty()
  keyword: string

  @IsString()
  @IsNotEmpty()
  reason: string

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
