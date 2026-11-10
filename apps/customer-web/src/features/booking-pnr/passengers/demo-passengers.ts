import type { TravellerDraft } from '../flow/draft'

export interface DemoPassenger {
  id: string
  givenName: string
  familyName: string
  dateOfBirth: string
  passportNumber: string
}

export function resolveDemoPassengers(travellers: TravellerDraft[], profiles: DemoPassenger[]) {
  const used = new Set<string>()
  return travellers.map((traveller) => {
    const profile = profiles.find((candidate) => candidate.id === traveller.demoPassengerId)
    if (!profile || used.has(profile.id)) throw new Error('Select a different demo traveller for each passenger.')
    if (
      traveller.givenName !== profile.givenName ||
      traveller.familyName !== profile.familyName ||
      traveller.dateOfBirth !== profile.dateOfBirth ||
      traveller.passportNumber !== profile.passportNumber
    ) {
      throw new Error('Demo traveller details cannot be changed. Select the demo traveller again.')
    }
    used.add(profile.id)
    return { key: traveller.key, passengerId: profile.id }
  })
}
