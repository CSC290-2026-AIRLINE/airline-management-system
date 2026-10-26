import { IsOptional, IsUUID } from 'class-validator'

export class ListBaseFaresDto {
  @IsOptional()
  @IsUUID()
  route_id?: string

  @IsOptional()
  @IsUUID()
  fare_class_id?: string
}
