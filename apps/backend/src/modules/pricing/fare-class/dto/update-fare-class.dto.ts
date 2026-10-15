import { PartialType } from '@nestjs/mapped-types'
import { CreateFareClassDto } from './create-fare-class.dto'

export class UpdateFareClassDto extends PartialType(CreateFareClassDto) {}
