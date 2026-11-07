import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { BAG_COLOURS, BAG_TYPES, type BagColour, type BagType } from '../common/baggage.constants'

/** Body of `PATCH /api/staff/found-bags/:id`: staff add what a diverted-flight bag looks like after checking it. */
export class CompleteFoundBagDetailsDto {
  @IsIn(BAG_TYPES)
  bagType: BagType

  @IsIn(BAG_COLOURS)
  colour: BagColour

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description?: string
}
