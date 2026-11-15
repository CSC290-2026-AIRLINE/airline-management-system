import type { TravellerDraft } from '../flow/draft'

export interface DemoPassenger {
  id: string
  givenName: string
  familyName: string
  dateOfBirth: string
  passportNumber: string
}

/** Whether the traveller still holds the details of the demo traveller that was picked for it. */
export function matchesDemoProfile(profile: DemoPassenger, traveller: TravellerDraft): boolean {
  return (
    traveller.givenName === profile.givenName &&
    traveller.familyName === profile.familyName &&
    traveller.dateOfBirth === profile.dateOfBirth &&
    traveller.passportNumber === profile.passportNumber
  )
}

/**
 * The demo travellers of a party. The staff console's booking flow still uses it, so the demo details there stay
 * read-only and every passenger has to be a seeded traveller.
 */
export function resolveDemoPassengers(travellers: TravellerDraft[], profiles: DemoPassenger[]) {
  const used = new Set<string>()
  return travellers.map((traveller) => {
    const profile = profiles.find((candidate) => candidate.id === traveller.demoPassengerId)
    if (!profile || used.has(profile.id)) throw new Error('Select a different demo traveller for each passenger.')
    if (!matchesDemoProfile(profile, traveller))
      throw new Error('Demo traveller details cannot be changed. Select the demo traveller again.')
    used.add(profile.id)
    return { key: traveller.key, passengerId: profile.id }
  })
}
