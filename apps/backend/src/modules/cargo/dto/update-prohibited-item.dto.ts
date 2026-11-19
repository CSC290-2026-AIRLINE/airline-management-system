import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class UpdateProhibitedItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  keyword?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
