import type { TravellerDraft } from '../flow/draft'

/** A traveller Feature 7 already holds for the booking customer: the customer themselves or one of their saved travellers. */
export interface SavedTraveller {
  /** The passenger id the booking uses. */
  id: string
  givenName: string
  familyName: string
  dateOfBirth: string
  /** As Feature 7 returns it. Staff may see it masked; it is shown, never sent with the booking. */
  passportNumber: string
  gender: string
  nationality: string
  /** How the traveller relates to the account, such as "You" or "Child". */
  label: string
  /** The signed-in customer's own record (updated through /customers/me rather than the saved-traveller routes). */
  self?: boolean
}

export const GENDER_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'X', label: 'Unspecified' },
] as const

/** The draft fields a saved traveller fills in when it is picked. */
export function fillFromSaved(profile: SavedTraveller | undefined): Partial<TravellerDraft> {
  return {
    savedPassengerId: profile?.id,
    givenName: profile?.givenName ?? '',
    familyName: profile?.familyName ?? '',
    dateOfBirth: profile?.dateOfBirth ?? '',
    passportNumber: profile?.passportNumber ?? '',
    gender: profile?.gender ?? '',
    nationality: profile?.nationality ?? '',
  }
}

/** Whether the traveller still holds the details of the saved traveller picked for it. */
export function matchesSavedTraveller(profile: SavedTraveller, traveller: TravellerDraft): boolean {
  return (
    traveller.givenName === profile.givenName &&
    traveller.familyName === profile.familyName &&
    traveller.dateOfBirth === profile.dateOfBirth &&
    traveller.passportNumber === profile.passportNumber
  )
}

/**
 * Whether the traveller is still the same person as the saved traveller: same names and date of birth. Only the
 * passport may differ, which happens when the saved record has none yet and the customer types it in.
 */
export function sameSavedPerson(profile: SavedTraveller, traveller: TravellerDraft): boolean {
  return (
    traveller.givenName.trim() === profile.givenName &&
    traveller.familyName.trim() === profile.familyName &&
    traveller.dateOfBirth === profile.dateOfBirth
  )
}

/**
 * The passenger ids of a party where every passenger must be an unchanged saved traveller. The staff console books
 * this way: a booking only accepts the customer's own travellers, and staff cannot add one to the customer's account.
 */
export function resolveSavedTravellers(travellers: TravellerDraft[], profiles: SavedTraveller[]) {
  const used = new Set<string>()
  return travellers.map((traveller) => {
    const profile = profiles.find((candidate) => candidate.id === traveller.savedPassengerId)
    if (!profile || used.has(profile.id)) throw new Error("Choose a different one of the customer's saved travellers for each passenger.")
    if (!matchesSavedTraveller(profile, traveller))
      throw new Error('Saved traveller details cannot be changed here. Choose the saved traveller again.')
    used.add(profile.id)
    return { key: traveller.key, passengerId: profile.id }
  })
}

/** Feature 7 returns dates as YYYY-MM-DD on customer routes and as ISO timestamps on staff routes. */
export function dateKey(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 10) : ''
}
