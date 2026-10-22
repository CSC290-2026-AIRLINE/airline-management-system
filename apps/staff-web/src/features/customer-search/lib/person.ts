import type { Gender, LinkedAccount, Person, SavedTraveller } from '../types'
import type { PassengerLinkResponse, PassengerProfileResponse, PassengerSummaryResponse } from './api'
import { formatMonthYear, localNameOf, toIsoDate } from './format'

/**
 * Maps the Customer Search wire responses onto this feature's `Person`.
 *
 * Every field the API marks nullable is preserved as null rather than defaulted,
 * so the UI can show an em dash for "not on record" instead of inventing a value.
 */

function toGender(value: PassengerSummaryResponse['gender']): Gender | null {
  // The column is a CHECK on M/F/X, but a null is possible and an unknown value
  // must not reach the UI as a `Gender`.
  return value === 'F' || value === 'M' || value === 'X' ? value : null
}

function toLinkPerson(link: PassengerLinkResponse): Person {
  return toPerson(link.person)
}

function toSavedTraveller(link: PassengerLinkResponse): SavedTraveller {
  return {
    person: toLinkPerson(link),
    relationship: link.relationship,
    lastBooked: formatMonthYear(link.lastBookedAt),
  }
}

function toLinkedAccount(link: PassengerLinkResponse): LinkedAccount {
  return {
    person: toLinkPerson(link),
    relationship: link.relationship,
    lastBooked: formatMonthYear(link.lastBookedAt),
  }
}

/** A row from the search list. Carries no links; those need `GET /api/passengers/:id`. */
export function toPerson(row: PassengerSummaryResponse): Person {
  const person: Person = {
    id: row.id,
    type: row.type,
    firstName: row.firstName,
    lastName: row.lastName,
    localFirstName: row.localFirstName,
    localLastName: row.localLastName,
    thaiName: localNameOf(row),
    // The API sends a full ISO timestamp; the feature works in `yyyy-mm-dd`.
    dateOfBirth: toIsoDate(row.dateOfBirth),
    gender: toGender(row.gender),
    nationality: row.nationality ? row.nationality.toLowerCase() : null,
    passportNumber: row.passportNumber,
    email: row.email,
    phone: row.phone,
    memberSince: formatMonthYear(row.memberSince),
  }
  return person
}

/** A full profile, including the saved travellers or the linked accounts. */
export function toProfilePerson(row: PassengerProfileResponse): Person {
  return {
    ...toPerson(row),
    savedTravellers: row.savedTravellers.map(toSavedTraveller),
    linkedAccounts: row.linkedAccounts.map(toLinkedAccount),
  }
}
