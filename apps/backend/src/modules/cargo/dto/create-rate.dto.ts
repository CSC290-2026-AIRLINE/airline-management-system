import { IsInt, IsNumber, IsOptional, IsBoolean, IsUUID, Min, Validate, ValidatorConstraint } from 'class-validator'
import type { ValidatorConstraintInterface, ValidationArguments } from 'class-validator'

@ValidatorConstraint({ name: 'distanceRange', async: false })
class DistanceRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as CreateRateDto
    if (obj.max_distance_km != null && obj.min_distance_km >= obj.max_distance_km) return false
    return true
  }

  defaultMessage(): string {
    return 'min_distance_km must be < max_distance_km'
  }
}

export class CreateRateDto {
  @IsUUID()
  commodity_type_id: string

  @IsInt()
  @Min(0)
  min_distance_km: number

  @IsOptional()
  @IsInt()
  @Min(1)
  @Validate(DistanceRangeConstraint)
  max_distance_km?: number | null

  @IsNumber()
  @Min(0.01, { message: 'rate_per_kg must be > 0' })
  rate_per_kg: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_charge?: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean
}
