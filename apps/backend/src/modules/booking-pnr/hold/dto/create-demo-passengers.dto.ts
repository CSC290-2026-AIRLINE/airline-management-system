import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Matches, MaxLength, ValidateNested } from 'class-validator'

export class CreateDemoPassengerDto {
  @IsString()
  @MaxLength(100)
  givenName!: string

  @IsString()
  @MaxLength(100)
  familyName!: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateOfBirth!: string

  @IsString()
  @MaxLength(30)
  passportNumber!: string
}

export class CreateDemoPassengersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(18)
  @ValidateNested({ each: true })
  @Type(() => CreateDemoPassengerDto)
  passengers!: CreateDemoPassengerDto[]
}
