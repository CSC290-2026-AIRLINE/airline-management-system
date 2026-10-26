import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

// Settings are stored as text; the service checks the value against the key's own rule.
export class UpdateSettingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  value!: string
}
