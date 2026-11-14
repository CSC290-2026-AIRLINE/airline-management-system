import { PickType } from '@nestjs/mapped-types'
import { CreateBaseFareDto } from './create-base-fare.dto'

// Only the amount changes. A different route or fare class is a different base fare: delete this one and create another.
export class UpdateBaseFareDto extends PickType(CreateBaseFareDto, ['amount'] as const) {}
