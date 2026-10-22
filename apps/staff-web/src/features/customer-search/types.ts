/**
 * Domain types for the Customer Search feature (staff-web).
 *
 * These mirror what `GET /api/passengers` and `GET /api/passengers/:id` actually
 * return, mapped in `lib/person.ts`. See `lib/api.ts` for the wire types.
 */

/**
 * The `type` search param, as it appears in the URL.
 *
 * Kebab-case, unlike the API's own `type=accountHolder`. The URL is the shareable
 * artefact, so it reads as a slug; `lib/api.ts` translates it on the way out and
 * `lib/searchParams.ts` translates it on the way in. Do not confuse this with
 * {@link Person.type}, which is the backend's spelling and stays camelCase.
 */
export type PersonFilter = 'all' | 'account-holder' | 'traveller'

/** `passenger.gender` is a `CHECK (gender IN ('M', 'F', 'X'))` on the column. */
export type Gender = 'F' | 'M' | 'X'

/**
 * A traveller saved on an account holder's profile. `relationship` is
 * `customer_passenger.relationship_type`, which is free text and nullable.
 */
export interface SavedTraveller {
  person: Person
  relationship: string | null
  /** `Aug 2026`, or null when this passenger has never booked with them. */
  lastBooked: string | null
}

/** An account holder a traveller is saved on. Same shape as {@link SavedTraveller}. */
export interface LinkedAccount {
  person: Person
  relationship: string | null
  lastBooked: string | null
}

export interface Person {
  /** The `passenger.id` UUID. It is also the routing key in the `person` search param. */
  id: string
  type: 'accountHolder' | 'traveller'
  firstName: string
  lastName: string
  /** Local (e.g. Thai) spelling. Kept unjoined because the correction API needs both parts. */
  localFirstName: string | null
  localLastName: string | null
  /** Derived from the two fields above; what the UI renders. */
  thaiName: string | null
  /** `yyyy-mm-dd`, or null when the passenger has no date of birth on record. */
  dateOfBirth: string | null
  gender: Gender | null
  /** Lower-case country code, or null. `format.nationalityLabel` renders it. */
  nationality: string | null
  /** Full number. The UI only ever renders the last four digits. */
  passportNumber: string | null

  // Account-holder-only; always null for a traveller.
  email: string | null
  phone: string | null
  /** `Mar 2025`, or null. */
  memberSince: string | null

  // Present only on a profile loaded from `GET /api/passengers/:id`.
  savedTravellers?: SavedTraveller[]
  linkedAccounts?: LinkedAccount[]
}

/**
 * The edits made in the "Correct identity" dialog. The page merges these into a
 * full `PATCH` body, because the API restates the whole identity record.
 */
export interface IdentityCorrection {
  /** Absent means "leave as recorded"; null means "clear the value on record". */
  dateOfBirth?: string | null
  gender?: Gender
  nationality?: string
  /** Required, and copied verbatim into the audit log. */
  reason: string
}

/**
 * Nationality codes offered in the correction dialog.
 *
 * The design's last option was a free-text `Other…`, but the API only accepts a
 * two-letter lower-case code (`nationality must be a two-letter country code in
 * lower case`), so there is no value `Other…` could store. It is left out rather
 * than offered as an option the server would reject. The displayed label comes
 * from `format.nationalityLabel`, not from here.
 */
export const NATIONALITY_CODES = ['th', 'mm'] as const
