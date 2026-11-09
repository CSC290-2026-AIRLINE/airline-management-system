import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min, Validate, ValidatorConstraint } from 'class-validator'
import type { ValidatorConstraintInterface, ValidationArguments } from 'class-validator'

@ValidatorConstraint({ name: 'weightRange', async: false })
class WeightRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as UpdateCommodityTypeDto
    if (obj.min_weight_kg != null && obj.max_weight_kg != null && obj.min_weight_kg > obj.max_weight_kg) return false
    if (obj.max_piece_weight_kg != null && obj.max_weight_kg != null && obj.max_piece_weight_kg > obj.max_weight_kg) return false
    return true
  }

  defaultMessage(args: ValidationArguments): string {
    const obj = args.object as UpdateCommodityTypeDto
    if (obj.min_weight_kg != null && obj.max_weight_kg != null && obj.min_weight_kg > obj.max_weight_kg) {
      return 'min_weight_kg must be <= max_weight_kg'
    }
    return 'max_piece_weight_kg must be <= max_weight_kg'
  }
}

export class UpdateCommodityTypeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  handling_class?: string

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_weight_kg?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Validate(WeightRangeConstraint)
  max_weight_kg?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Validate(WeightRangeConstraint)
  max_piece_weight_kg?: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
