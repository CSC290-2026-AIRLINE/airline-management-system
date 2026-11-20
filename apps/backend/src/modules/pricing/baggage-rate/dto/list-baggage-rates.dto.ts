import { IsOptional, IsUUID } from 'class-validator'

export class ListBaggageRatesDto {
  @IsOptional()
  @IsUUID()
  fare_class_id?: string
}
