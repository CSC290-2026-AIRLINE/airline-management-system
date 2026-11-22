import { Expose } from 'class-transformer'

export class ProfileResponseDto {
  @Expose() needsIdentitySetup!: boolean
  @Expose() passportNumber!: string | null
  @Expose() id!: string | null
  /** The customer's own passenger record, so the customer can book themselves. Null before the identity is set up. */
  @Expose() passengerId!: string | null
  @Expose() firstName!: string
  @Expose() lastName!: string
  @Expose() localFirstName!: string | null
  @Expose() localLastName!: string | null
  @Expose() email!: string
  @Expose() phone!: string | null
  @Expose() dateOfBirth!: string | null
  @Expose() gender!: string | null
  @Expose() nationality!: string | null
  @Expose() profilePhotoUrl!: string | null
}

export class SavedPassengerResponseDto {
  @Expose() id!: string
  @Expose() firstName!: string
  @Expose() lastName!: string
  @Expose() localFirstName!: string | null
  @Expose() localLastName!: string | null
  @Expose() relationship!: string | null
  @Expose() dateOfBirth!: string | null
  @Expose() gender!: string | null
  @Expose() nationality!: string | null
  @Expose() passportNumber!: string | null
}
