import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import type { CorrectIdentityDto } from './dto/correct-identity.dto'
import type { CreatePassengerDto } from './dto/create-passenger.dto'
import type { SearchCustomersDto } from './dto/search-customers.dto'
import type { PersonType, SearchPassengersDto } from './dto/search-passengers.dto'
import { looksLikeUuid } from './dto/search-passengers.dto'

/** Recorded as `audit_log.source_feature` so Feature 15 can filter this module's rows. */
const SOURCE_FEATURE = 'passenger-profiles'

/**
 * The only audit actions this module writes.
 *
 * `audit_log.action` is constrained by a CHECK to a shared enum (see `schema.sql`), and
 * Feature 15 owns that surface. Both values below are already in that enum:
 *
 *  - `view_sensitive` — the Artifact requires opening a passenger or customer detail to be
 *    audited, and names this value for exactly that.
 *  - `update` — the Artifact says a correction is "logged in feature 15" but never names an
 *    action for it. `update` is the existing enum value that describes a staff correction;
 *    the correction-specific detail lives in `reason` and the `before`/`after` snapshots.
 *    See the module README for why this is not a bespoke action.
 */
const AUDIT_VIEW_SENSITIVE = 'view_sensitive'
const AUDIT_UPDATE = 'update'

type PersonTypeFilter = Exclude<PersonType, 'all'>
export interface PassengerSummary {
  id: string
  type: PersonTypeFilter
  firstName: string
  lastName: string
  localFirstName: string | null
  localLastName: string | null
  dateOfBirth: Date | null
  gender: string | null
  nationality: string | null
  passportNumber: string | null
  memberSince: Date | null
  email: string | null
  phone: string | null
}

export interface PassengerLink {
  relationship: string | null
  lastBookedAt: Date | null
  person: PassengerSummary
}

export interface PassengerProfile extends PassengerSummary {
  profilePhotoUrl: string | null
  savedTravellers: PassengerLink[]
  linkedAccounts: PassengerLink[]
}

export interface PassengerSearchResult {
  items: PassengerSummary[]
  total: number
  page: number
  size: number
}

const IDENTITY_FIELDS = {
  id: true,
  first_name: true,
  last_name: true,
  local_first_name: true,
  local_last_name: true,
  date_of_birth: true,
  gender: true,
  nationality: true,
  passport_number: true,
} as const

/** `customer` is the holder's own account, so its presence is what makes a passenger an account holder. */
const SUMMARY_SELECT = {
  ...IDENTITY_FIELDS,
  customer: {
    where: { deleted_at: null },
    select: {
      id: true,
      phone: true,
      created_at: true,
      user: { select: { email: true } },
    },
  },
} as const

/** Both sides of a link are loaded because the direction is only known once we know whether the passenger holds an account. */
const LINK_SELECT = {
  where: { is_saved: true },
  orderBy: { last_booked_at: { sort: 'desc', nulls: 'last' } },
  select: {
    relationship_type: true,
    last_booked_at: true,
    passenger: { select: SUMMARY_SELECT },
    // `customer_passenger.customer` is required, and Prisma only offers a filtered relation
    // read (`where`) on optional relations — asking for one here is a validation error. The
    // soft-delete check therefore happens in `getProfile` instead, hence `deleted_at`.
    customer: {
      select: {
        id: true,
        phone: true,
        profile_photo_url: true,
        created_at: true,
        deleted_at: true,
        user: { select: { email: true } },
        passenger: { select: SUMMARY_SELECT },
      },
    },
  },
} as const

type SummaryRow = {
  id: string
  first_name: string
  last_name: string
  local_first_name: string | null
  local_last_name: string | null
  date_of_birth: Date | null
  gender: string | null
  nationality: string | null
  passport_number: string | null
  customer: {
    id: string
    phone: string | null
    created_at: Date
    user: { email: string }
  } | null
}

/**
 * One row of `customer_passenger`, read from the `LINK_SELECT` shape. Both ends are loaded
 * because the useful direction is only known once we know whether the passenger holds an account.
 */
type ProfileLink = {
  relationship_type: string | null
  last_booked_at: Date | null
  passenger: SummaryRow
  // Null is possible even though the column is required, because Prisma cannot filter the
  // relation read here — `getProfile` drops soft-deleted accounts instead.
  customer: {
    id: string
    phone: string | null
    profile_photo_url: string | null
    created_at: Date
    deleted_at: Date | null
    user: { email: string }
    passenger: SummaryRow
  } | null
}

/** The row both detail routes read: the passenger, their account if they hold one, and both link ends. */
type ProfileRow = Omit<SummaryRow, 'customer'> & {
  customer: {
    id: string
    phone: string | null
    created_at: Date
    profile_photo_url: string | null
    user: { email: string }
    customer_passenger: ProfileLink[]
  } | null
  customer_passenger: ProfileLink[]
}

function toSummary(row: SummaryRow): PassengerSummary {
  return {
    id: row.id,
    type: row.customer ? 'accountHolder' : 'traveller',
    firstName: row.first_name,
    lastName: row.last_name,
    localFirstName: row.local_first_name,
    localLastName: row.local_last_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    nationality: row.nationality,
    // Masked here, not in the browser: see {@link maskPassport}.
    passportNumber: maskPassport(row.passport_number),
    memberSince: row.customer?.created_at ?? null,
    email: row.customer?.user.email ?? null,
    phone: row.customer?.phone ?? null,
  }
}

/**
 * Masks a passport number for the API response, keeping the last four characters.
 *
 * The Artifact requires the API to mask the passport "for non-security staff", so the
 * masking happens here rather than in the browser. There is no security role to tell the
 * two apart — `staff.role_id` points at roles seeded as check-in/gate/baggage/admin, none of
 * them security — so this masks for every caller and the exception is reported as a
 * blocker rather than guessed at. See the module README.
 *
 * The search list is masked as well as the detail screen: a staff member typing a passport
 * into the search box is doing customer service, and the row they are about to open is the
 * one this number belongs to.
 */
export function maskPassport(passportNumber: string | null): string | null {
  return passportNumber ? `•••• ${passportNumber.slice(-4)}` : null
}

/**
 * Masks a date of birth down to its year.
 *
 * The Artifact requires DOB to be masked in audit entries alongside the passport. `view_sensitive`
 * only records *that* a profile was opened, so the exact birthday buys the audit trail nothing —
 * the year is enough to tell two profiles apart, and the month and day stay out of the console.
 */
function maskDateOfBirth(dateOfBirth: Date | null): string | null {
  return dateOfBirth ? `••••-••-${String(dateOfBirth.getUTCDate()).padStart(2, '0')}` : null
}

/**
 * The columns a `view_sensitive` audit row records.
 *
 * The Artifact says "passport and DOB are masked in audit entries", so both are masked here. This
 * is a view record rather than a change record, so masking costs the audit trail nothing — contrast
 * {@link auditSnapshot}, where the same rule collides with the point of the row.
 */
function sensitiveSnapshot(row: SummaryRow): Prisma.InputJsonValue {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    date_of_birth: maskDateOfBirth(row.date_of_birth),
    passport_number: maskPassport(row.passport_number),
  }
}

/**
 * The `before` half of a correction's audit pair. Passport is masked, per the Artifact.
 *
 * The date of birth is written in the clear here and in {@link correctedSnapshot}, which departs
 * from the Artifact's "passport and DOB are masked in audit entries". Masking it would make the
 * before/after pair read `••••-••-03 → ••••-••-08`, and no longer record what was corrected — the
 * one thing this row exists to do. The Artifact also never names an action or a column set for a
 * correction, so this is recorded as an open question for the Admin Console team (Feature 15),
 * which owns `audit_log`, rather than resolved here. See _Blockers_ in the README.
 */
function auditSnapshot(row: SummaryRow): Prisma.InputJsonValue {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    local_first_name: row.local_first_name,
    local_last_name: row.local_last_name,
    date_of_birth: row.date_of_birth?.toISOString().slice(0, 10) ?? null,
    gender: row.gender,
    nationality: row.nationality,
    passport_number: maskPassport(row.passport_number),
  }
}

/** The `after` half of the correction snapshot: the three corrected columns, others unchanged. */
function correctedSnapshot(before: SummaryRow, dto: CorrectIdentityDto): Prisma.InputJsonValue {
  return {
    date_of_birth: dto.dateOfBirth?.toISOString().slice(0, 10) ?? before.date_of_birth?.toISOString().slice(0, 10) ?? null,
    gender: dto.gender ?? before.gender,
    nationality: dto.nationality ?? before.nationality,
  }
}

/**
 * A short, safe description for a log line. Prisma and Nest errors can carry the whole
 * query in `message`, so only the error class is used rather than the text.
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.constructor.name : typeof error
}

/**
 * Splits on whitespace, so `"  Anabel   Effertz "` yields the two real terms — but keeps a
 * date written in words together as one term.
 *
 * The staff UI renders a date of birth as `03 Aug 1992` (`formatDateOfBirth`), so a staff
 * member searching for a date copies what is on screen. Splitting that into three terms would
 * require `03` *and* `Aug` to match a name as well, which nothing ever does, so the search
 * returns nothing. The longest span is tried first, so a date is recognised before it is torn
 * into words that cannot match anything.
 *
 * A partial date stays whole for the same reason: `03 Sept` has to be one term meaning "the
 * third of September", not two terms that happen to be matched independently.
 */
function tokenizeQuery(q: string): string[] {
  const words = q.split(/\s+/).filter((word) => word !== '')
  const tokens: string[] = []

  for (let index = 0; index < words.length; index += 1) {
    const three = words.slice(index, index + 3).join(' ')
    const two = words.slice(index, index + 2).join(' ')

    if (dateOfBirth(three)) {
      tokens.push(three)
      index += 2
      continue
    }
    if (dateOfBirth(two)) {
      tokens.push(two)
      index += 1
      continue
    }
    tokens.push(words[index])
  }

  return tokens
}

function containsInsensitive(term: string) {
  return { contains: term, mode: 'insensitive' as const }
}

/** The shortest year this will read as a date of birth, matching `readDateOfBirth`'s floor. */
const EARLIEST_SEARCH_YEAR = 1900

/** Past the end of any plausible booking, so `9999` is not read as a year. */
const LATEST_SEARCH_YEAR = 2100

/**
 * Full month names, matched by prefix.
 *
 * The staff UI renders a date with `Intl.DateTimeFormat('en-GB', { month: 'short' })`, and that
 * abbreviation is **not** always three letters: CLDR spells September `Sept`, so `03 Sept 2012`
 * is what is actually on screen. Matching the full name by prefix accepts both `Sep` and `Sept`,
 * and the full name too, without a table that has to be kept in step with the browser's ICU.
 *
 * Three letters is the shortest accepted prefix, and it is exactly enough to stay unambiguous:
 * no two months share a three-letter prefix (`mar`/`may` and `jun`/`jul` are the near misses).
 * That is what keeps `junk` from being read as June.
 */
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const SHORTEST_MONTH_PREFIX = 3

/** `1992`, `1992-08` or `1992-08-03`. */
const ISO_DATE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/

/** `03/08/1992` or `03-08-1992`, both separators required to be the same. */
const SEPARATED_DATE = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/

/** `03 Sept 1992` — the exact shape `formatDateOfBirth` puts on screen. */
const DAY_MONTH_YEAR = /^(\d{1,2}) ([a-z]{3,9}) (\d{4})$/i

/** `Sept 03 1992` and `Sept 1992`, the other ways the same date is written. */
const MONTH_DAY_YEAR = /^([a-z]{3,9}) (\d{1,2}) (\d{4})$/i
const MONTH_YEAR = /^([a-z]{3,9}) (\d{4})$/i

/** `03 Sept` and `Sept 03` — a day and its month, with no year. */
const DAY_MONTH = /^(\d{1,2}) ([a-z]{3,9})$/i
const MONTH_DAY = /^([a-z]{3,9}) (\d{1,2})$/i

/** `03 1992` — a day in a named year. */
const DAY_YEAR = /^(\d{1,2}) (\d{4})$/

/** A bare `08`, which is either the eighth day or August. */
const BARE_DAY_OR_MONTH = /^(\d{1,2})$/

/** A bare `Sept`, which is a month in any year. */
const BARE_MONTH = /^([a-z]{3,9})$/i

/** A month name or prefix of one as the 1-based number {@link range} expects, or null if it is neither. */
function monthNumber(name: string): number | null {
  const lower = name.toLowerCase()
  if (lower.length < SHORTEST_MONTH_PREFIX) {
    return null
  }
  const index = MONTH_NAMES.findIndex((month) => month.startsWith(lower))
  return index === -1 ? null : index + 1
}

/**
 * Builds the half-open range of days a partially-specified date could cover, so `1992` means
 * the whole of 1992 and `1992-08` the whole of August.
 *
 * `date_of_birth` is a `@db.Date`, so it cannot take a `contains` filter the way the text
 * columns do. A range is also what keeps this on `passenger_dob_idx` instead of forcing a cast
 * per row.
 *
 * Omitting the month or day means "any", never day 0: the start is floored to the first and
 * the end to the next period. `Date.UTC` rolls month and year over on its own, so December
 * needs no special case.
 */
function range(year: number, month: number | null, day: number | null): { gte: Date; lt: Date } | null {
  if (year < EARLIEST_SEARCH_YEAR || year > LATEST_SEARCH_YEAR) {
    return null
  }
  if (month === null) {
    return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
  }
  if (month < 1 || month > 12) {
    return null
  }

  const monthIndexStart = month - 1
  const gte = new Date(Date.UTC(year, monthIndexStart, day ?? 1))
  // Rejects a rolled-over day such as `2023-02-30`, which `Date.UTC` would quietly push into March.
  if (gte.getUTCFullYear() !== year || gte.getUTCMonth() !== monthIndexStart || gte.getUTCDate() !== (day ?? 1)) {
    return null
  }

  const lt = day === null ? new Date(Date.UTC(year, monthIndexStart + 1, 1)) : new Date(Date.UTC(year, monthIndexStart, day + 1))
  return { gte, lt }
}

/** The half-open range of days a fully-specified date could cover. */
type DateRange = { gte: Date; lt: Date }

/** A date with some of its parts left open, e.g. "the third of September, any year". */
type PartialDate = { year?: number; month?: number; day?: number }

/**
 * What one term of `q` means as a date of birth.
 *
 * A `range` runs contiguously from 1 January of a known year, so Prisma can filter it and
 * `passenger_dob_idx` still applies. `parts` is everything else — a bare day, a month with no
 * year, a day whose month was never given — which no single range can describe and which
 * `date_of_birth` being a `@db.Date` cannot take a `contains` for either.
 */
type DateMatch = { kind: 'range'; range: DateRange } | { kind: 'parts'; alternatives: PartialDate[] }

/**
 * Turns a date of birth written in any of the shapes staff actually use into something
 * filterable, or returns null when the token is not a date at all.
 *
 * Null is what keeps an ordinary name or a passport token from becoming a range. It is also
 * what keeps nonsense out: `2023-02-30` is not a real date, `199` is not a day, and `0` is
 * neither a day nor a month, so none of them is treated as one.
 */
function dateOfBirth(token: string): DateMatch | null {
  const asRange = (year: number, month: number | null, day: number | null): DateMatch | null => {
    const found = range(year, month, day)
    return found ? { kind: 'range', range: found } : null
  }

  const iso = ISO_DATE.exec(token)
  if (iso) {
    return asRange(Number(iso[1]), iso[2] === undefined ? null : Number(iso[2]), iso[3] === undefined ? null : Number(iso[3]))
  }

  const separated = SEPARATED_DATE.exec(token)
  if (separated) {
    // Day first: the UI's own date input is `DD / MM / YYYY`, so this is the order staff type.
    return asRange(Number(separated[4]), Number(separated[3]), Number(separated[1]))
  }

  const dayMonthYear = DAY_MONTH_YEAR.exec(token)
  if (dayMonthYear) {
    const month = monthNumber(dayMonthYear[2])
    return month === null ? null : asRange(Number(dayMonthYear[3]), month, Number(dayMonthYear[1]))
  }

  const monthDayYear = MONTH_DAY_YEAR.exec(token)
  if (monthDayYear) {
    const month = monthNumber(monthDayYear[1])
    return month === null ? null : asRange(Number(monthDayYear[3]), month, Number(monthDayYear[2]))
  }

  const monthYear = MONTH_YEAR.exec(token)
  if (monthYear) {
    const month = monthNumber(monthYear[1])
    return month === null ? null : asRange(Number(monthYear[2]), month, null)
  }

  const dayMonth = DAY_MONTH.exec(token)
  if (dayMonth) {
    const month = monthNumber(dayMonth[2])
    const day = Number(dayMonth[1])
    return month === null || !isDayOfMonth(day) ? null : { kind: 'parts', alternatives: [{ month, day }] }
  }

  const monthDay = MONTH_DAY.exec(token)
  if (monthDay) {
    const month = monthNumber(monthDay[1])
    const day = Number(monthDay[2])
    return month === null || !isDayOfMonth(day) ? null : { kind: 'parts', alternatives: [{ month, day }] }
  }

  const dayYear = DAY_YEAR.exec(token)
  if (dayYear) {
    const year = Number(dayYear[2])
    const day = Number(dayYear[1])
    return !isDayOfMonth(day) || year < EARLIEST_SEARCH_YEAR || year > LATEST_SEARCH_YEAR
      ? null
      : { kind: 'parts', alternatives: [{ year, day }] }
  }

  const bareMonth = BARE_MONTH.exec(token)
  if (bareMonth) {
    const month = monthNumber(bareMonth[1])
    return month === null ? null : { kind: 'parts', alternatives: [{ month }] }
  }

  const bareDayOrMonth = BARE_DAY_OR_MONTH.exec(token)
  if (bareDayOrMonth) {
    const day = Number(bareDayOrMonth[1])
    if (!isDayOfMonth(day)) {
      return null
    }
    // `08` is ambiguous — the eighth of some month, or some day in August — and a staff member
    // typing it into a search box wants both rather than a coin toss. It is offered as two
    // alternatives, never as a conjunction, so neither reading rules out the other.
    return { kind: 'parts', alternatives: [{ day }, { month: day }] }
  }

  return null
}

/** A day that exists in some month; February's shorter length is not checked, because a day alone cannot say which month. */
function isDayOfMonth(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31
}

/**
 * A fragment of the person id, as a staff member reads it off the results table.
 *
 * `passenger.id` is a `@db.Uuid`, so Prisma's query builder cannot `contains` it and matching
 * one has to cast the column to text in SQL. Two rules keep that cast rare enough to be worth
 * the extra round trip it costs:
 *
 * - Only hex digits and dashes, so an ordinary name never triggers it.
 * - At least two characters, and at least one digit, so a single character does not pull back
 *   nearly every row. A two-character fragment is already specific enough for staff use.
 *
 * A term of one character still matches every text column it always did; it simply is not
 * tried against the id.
 */
const ID_FRAGMENT = /^[0-9a-f-]+$/i
const SHORTEST_ID_FRAGMENT = 2

/**
 * A piece of SQL and the values bound into it.
 *
 * Prisma's own `sql` tag would build this, but importing it means importing the generated
 * client at runtime, and the generated client is ESM — which Jest cannot resolve, and which
 * this module's unit tests deliberately avoid by mocking `DbService` instead. Holding the
 * fragments here keeps the module importable, and keeps every value a bound parameter: a search
 * term reaches the driver only as a value, never as statement text.
 *
 * Fragments are written with a `?`, which stands in for "a value goes here" and is renumbered
 * by {@link numbered} once the whole statement is assembled. It is deliberately *not* the
 * placeholder that reaches Postgres — see that function for why.
 */
interface SqlFragment {
  text: string
  values: unknown[]
}

const SQL_AND = ' AND '
const SQL_OR = ' OR '

/** Concatenates fragments, so their placeholders and their values stay in the same order. */
function joinFragments(fragments: SqlFragment[], separator: string): SqlFragment {
  return {
    text: fragments.map((fragment) => fragment.text).join(separator),
    values: fragments.flatMap((fragment) => fragment.values),
  }
}

/**
 * Replaces each `?` with the `$1`, `$2, … that Postgres actually takes.
 *
 * Postgres numbers its placeholders and has no `?` at all. Prisma rewrites one dialect's
 * placeholder into another's inside its `sql` tag, but `$queryRawUnsafe` does no such
 * rewriting — it hands the statement and the values to the driver exactly as given, and the
 * `pg` adapter passes them to the server unchanged. So a `?` that reached the database would be
 * a syntax error, not a parameter, and every term needing SQL would fail. `joinFragments`
 * appends values in the same order it concatenates text, so the nth `?` is the nth value.
 *
 * Only ever substituted for text this module built: no user input reaches a statement, only a
 * bound value, so a `?` here is always one of ours.
 */
function numbered(fragment: SqlFragment): string {
  let index = 0
  return fragment.text.replace(/\?/g, () => `$${++index}`)
}

function idFragmentSql(token: string): SqlFragment | null {
  if (token.length < SHORTEST_ID_FRAGMENT || !ID_FRAGMENT.test(token) || !/\d/.test(token)) {
    return null
  }
  // The fragment is bound as a parameter, never interpolated, so it cannot reach the SQL.
  return { text: 'id::text ILIKE ?', values: [`%${token}%`] }
}

/**
 * One calendar part, e.g. `EXTRACT(DAY FROM date_of_birth) = 3`.
 *
 * `date_of_birth` is a `@db.Date`, so Prisma can only compare it against a range; there is no
 * filter for "the month is 9" however it is spelled. Postgres can say it with `EXTRACT`.
 */
function datePartSql(alternative: PartialDate): SqlFragment {
  const parts: SqlFragment[] = []
  if (alternative.year !== undefined) {
    parts.push({ text: 'EXTRACT(YEAR FROM date_of_birth) = ?', values: [alternative.year] })
  }
  if (alternative.month !== undefined) {
    parts.push({ text: 'EXTRACT(MONTH FROM date_of_birth) = ?', values: [alternative.month] })
  }
  if (alternative.day !== undefined) {
    parts.push({ text: 'EXTRACT(DAY FROM date_of_birth) = ?', values: [alternative.day] })
  }
  // Parenthesised so the `AND` inside one alternative can never bind across to the next one.
  const one = joinFragments(parts, SQL_AND)
  return { text: `(${one.text})`, values: one.values }
}

/** A partial date as one predicate: its alternatives joined by `OR`, its own parts by `AND`. */
function datePartsSql(alternatives: PartialDate[]): SqlFragment {
  return joinFragments(alternatives.map(datePartSql), SQL_OR)
}

/**
 * What one search term may match.
 *
 * A term matches any one of these, and {@link buildSearchWhere} requires every term to match
 * one — which is what lets `Anabel Effertz` find a row where the two words sit in different
 * columns, and what lets a single `08` return the person whose id carries it, the person whose
 * passport does, and the person born on the eighth, all from one query.
 *
 * The two lists exist because two of the searchable fields cannot be expressed in Prisma's
 * query builder at all: a substring of a `@db.Uuid` column, and a calendar part of a `@db.Date`
 * column. Those become a small `SELECT id` and come back as one more alternative on the same
 * `OR`, so a term still matches whichever field carries it.
 */
interface TokenPlan {
  /** What Prisma's query builder can filter. */
  clauses: Prisma.passengerWhereInput[]
  /** What only Postgres can: a uuid substring, and a date with no contiguous range. */
  sql: SqlFragment[]
}

function planToken(token: string): TokenPlan {
  // A whole uuid is matched as the id *alone*: running it through the text `contains` clauses
  // as well would search four name columns and an email for a value that can only ever be an
  // id, and a passport number cannot contain a dash, so nothing legitimate is lost by not
  // doing it. `passenger.id` is a `@db.Uuid`, so a non-uuid must never be compared to it.
  if (looksLikeUuid(token)) {
    return { clauses: [{ id: token }], sql: [] }
  }

  const clauses: Prisma.passengerWhereInput[] = [
    { first_name: containsInsensitive(token) },
    { last_name: containsInsensitive(token) },
    { local_first_name: containsInsensitive(token) },
    { local_last_name: containsInsensitive(token) },
    { passport_number: containsInsensitive(token) },
    // The placeholder promises email, and only an account holder has one. A soft-deleted
    // account's address must not surface, so it is scoped out here as well.
    { customer: { is: { deleted_at: null, user: { email: containsInsensitive(token) } } } },
  ]

  const sql: SqlFragment[] = []

  const date = dateOfBirth(token)
  if (date?.kind === 'range') {
    clauses.push({ date_of_birth: date.range })
  } else if (date) {
    sql.push(datePartsSql(date.alternatives))
  }

  const idFragment = idFragmentSql(token)
  if (idFragment) {
    sql.push(idFragment)
  }

  return { clauses, sql }
}

@Injectable()
export class PassengerProfilesService {
  private readonly logger = new Logger(PassengerProfilesService.name)

  constructor(private readonly db: DbService) {}

  async search(dto: SearchPassengersDto): Promise<PassengerSearchResult> {
    return this.runSearch(await this.buildSearchWhere(dto.q, dto.type), dto.page, dto.size)
  }

  /**
   * The account-holder half of {@link search}, for `GET /api/staff/customers`.
   *
   * Identical query, ordering and paging — the only difference is that the split is fixed, so a
   * caller cannot ask this route for travellers.
   */
  async searchAccountHolders(dto: SearchCustomersDto): Promise<PassengerSearchResult> {
    return this.runSearch(await this.buildSearchWhere(dto.q, 'accountHolder'), dto.page, dto.size)
  }

  /**
   * The rows a term's SQL-only predicates match, by id.
   *
   * Only the two filters Prisma cannot express reach this: a substring of the `@db.Uuid` id
   * column and a calendar part of the `@db.Date` date of birth. Both are answered by one small
   * `SELECT id`, and the ids come back as one more alternative on the same `OR` as the text
   * columns — so paging, ordering, the account-holder split and the count are still the single
   * query {@link runSearch} makes, with nothing filtered in the browser.
   *
   * `deleted_at` is honoured here as well, so a soft-deleted row cannot re-enter through the
   * cast. The account-holder/traveller split is deliberately *not* applied: it is already on
   * the outer query, and duplicating it here would mean two rules to keep in step.
   *
   * A query of plain names never gets here — {@link planToken} only produces SQL for a term
   * that actually needs it, so `Anabel Effertz` still costs the one transaction it always did.
   */
  private async findPassengerIds(predicates: SqlFragment[]): Promise<string[]> {
    const matched = joinFragments(predicates, SQL_OR)
    const rows = await this.db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM passenger WHERE deleted_at IS NULL AND (${numbered(matched)})`,
      ...matched.values,
    )
    return rows.map((row) => row.id)
  }

  private async runSearch(where: Prisma.passengerWhereInput, page: number, size: number): Promise<PassengerSearchResult> {
    const skip = (page - 1) * size

    // Counted alongside the page so both read the same snapshot.
    const [rows, total] = await this.db.$transaction([
      this.db.passenger.findMany({
        where,
        select: SUMMARY_SELECT,
        orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }, { id: 'asc' }],
        skip,
        take: size,
      }),
      this.db.passenger.count({ where }),
    ])

    return { items: rows.map(toSummary), total, page, size }
  }

  /**
   * Records a new passenger with no account behind it, which is what makes a row a
   * `traveller` in {@link toSummary}. `created_at`/`updated_at` are left to their column
   * defaults rather than set here, so an insert cannot claim to predate the row.
   *
   * Deliberately writes no `audit_log` row: a correction has a `before` state worth
   * recording and a `reason` to justify it, and a create has neither. Say so here rather
   * than leaving a silent gap for the Admin Console team.
   */
  async create(dto: CreatePassengerDto, actor: AuthenticatedUser): Promise<PassengerSummary> {
    const created = await this.db.passenger.create({
      data: {
        first_name: dto.firstName,
        last_name: dto.lastName,
        local_first_name: dto.localFirstName,
        local_last_name: dto.localLastName,
        date_of_birth: dto.dateOfBirth,
        gender: dto.gender,
        nationality: dto.nationality,
        passport_number: dto.passportNumber,
      },
      select: SUMMARY_SELECT,
    })

    // Ids only; the names are already in the response and in the row.
    this.logger.log(`Passenger ${created.id} created by user ${actor.id}`)

    return toSummary(created)
  }

  async getProfile(id: string, actor: AuthenticatedUser): Promise<PassengerProfile> {
    const row = await this.findProfileRow(id)
    if (!row) {
      throw new NotFoundException(`Passenger ${id} was not found`)
    }

    // The Artifact audits opening a profile. Awaited so the row is written before the
    // response is sent, rather than being lost if the process exits mid-request.
    await this.auditView(row, actor)

    return this.buildProfile(row)
  }

  /**
   * The account-holder half of {@link getProfile}, for `GET /api/staff/customers/:id`.
   *
   * A traveller id is a `404` here rather than a traveller profile: the route is the account
   * side, and answering it for a traveller would make the two routes indistinguishable. The
   * check runs *before* {@link auditView}, so a rejected read leaves no audit row — the same
   * rule the not-found path follows.
   */
  async getAccountHolder(id: string, actor: AuthenticatedUser): Promise<PassengerProfile> {
    const row = await this.findProfileRow(id)
    if (!row) {
      throw new NotFoundException(`Passenger ${id} was not found`)
    }
    if (row.customer === null) {
      throw new NotFoundException(`Passenger ${id} is not an account holder`)
    }

    await this.auditView(row, actor)

    return this.buildProfile(row)
  }

  /**
   * One query for both detail routes: the passenger, their account if they hold one, and both
   * ends of the link table. Returns null for a missing or soft-deleted passenger.
   */
  private async findProfileRow(id: string): Promise<ProfileRow | null> {
    return this.db.passenger.findFirst({
      where: { id, deleted_at: null },
      select: {
        ...SUMMARY_SELECT,
        customer: {
          where: { deleted_at: null },
          select: {
            id: true,
            phone: true,
            created_at: true,
            profile_photo_url: true,
            user: { select: { email: true } },
            // The same link table read from the other end — see `buildProfile`.
            customer_passenger: LINK_SELECT,
          },
        },
        customer_passenger: LINK_SELECT,
      },
    })
  }

  private buildProfile(row: ProfileRow): PassengerProfile {
    const isAccountHolder = row.customer !== null

    // `customer_passenger` is "who a customer books for" (schema.sql), so it
    // answers a different question from each end, and which one applies depends
    // on who this passenger is:
    //
    //  - An account holder's saved travellers are the rows keyed on their
    //    customer — `customer.customer_passenger`. The passenger-level relation
    //    is the wrong end here: it lists the accounts that have saved *this*
    //    passenger, which is the traveller's question, and it comes back empty
    //    for a holder who is not themselves saved on their own account.
    //  - A traveller's linked accounts are the rows keyed on this passenger, so
    //    those come off the passenger-level relation.
    //
    // Both are read in the single query above rather than a second round trip.
    const links: PassengerLink[] = (isAccountHolder ? (row.customer?.customer_passenger ?? []) : row.customer_passenger).flatMap((link) => {
      if (isAccountHolder) {
        // The holder is not one of their own travellers, even when their own
        // passenger row is among the account's saved links.
        if (link.passenger.id === row.id) return []
        return [{ relationship: link.relationship_type, lastBookedAt: link.last_booked_at, person: toSummary(link.passenger) }]
      }
      if (!link.customer || link.customer.deleted_at) {
        return []
      }
      const holder = toSummary(link.customer.passenger)
      return [
        {
          relationship: link.relationship_type,
          lastBookedAt: link.last_booked_at,
          person: {
            ...holder,
            email: link.customer.user.email,
            phone: link.customer.phone,
            memberSince: link.customer.created_at,
          },
        },
      ]
    })

    return {
      ...toSummary(row),
      profilePhotoUrl: row.customer?.profile_photo_url ?? null,
      savedTravellers: isAccountHolder ? links : [],
      linkedAccounts: isAccountHolder ? [] : links,
    }
  }

  /**
   * Records that a staff member opened a passenger or customer profile.
   *
   * The Artifact requires this: "opening passenger or customer detail is audited as
   * `view_sensitive`", and `view_sensitive` is already in the shared `action` enum.
   *
   * Written after the read rather than inside it, so a 404 writes nothing, and never in a
   * transaction with the read: the audit row records that a view happened, and failing to
   * write it must not take the profile the staff member asked for down with it.
   */
  private async auditView(row: SummaryRow, actor: AuthenticatedUser): Promise<void> {
    try {
      const actorUser = await this.db.user.findUnique({ where: { id: actor.id }, select: { type: true } })
      if (!actorUser) {
        // The guard already proved the token is valid; a user row that has since gone is
        // not this view's problem to report.
        return
      }

      await this.db.audit_log.create({
        data: {
          occurred_at: new Date(),
          actor_type: actorUser.type,
          actor_id: actor.id,
          source_feature: SOURCE_FEATURE,
          action: AUDIT_VIEW_SENSITIVE,
          entity_type: 'passenger',
          entity_id: row.id,
          summary: `Viewed profile for ${row.first_name} ${row.last_name}`,
          // Passport and DOB are masked in audit entries; see {@link sensitiveSnapshot}.
          before: sensitiveSnapshot(row),
          is_sensitive: true,
        },
      })
    } catch (error) {
      // An audit write must not turn a successful read into a 500.
      this.logger.warn(`Could not record a view_sensitive audit row for passenger ${row.id}: ${describeError(error)}`)
    }
  }

  /**
   * Applies a staff identity correction and records why in `audit_log`, both in
   * one transaction so a passenger row can never change without its audit trail.
   *
   * Only the three identity-lock columns are written. Names, local spellings and the
   * passport number are left as they are: the Artifact scopes a correction to date of
   * birth, gender and nationality, and `CorrectIdentityDto` does not declare the others,
   * so `whitelist` drops them before they reach this method.
   */
  async correctIdentity(id: string, dto: CorrectIdentityDto, actor: AuthenticatedUser): Promise<PassengerSummary> {
    const existing = await this.db.passenger.findFirst({ where: { id, deleted_at: null }, select: SUMMARY_SELECT })
    if (!existing) {
      throw new NotFoundException(`Passenger ${id} was not found`)
    }

    const actorUser = await this.db.user.findUnique({ where: { id: actor.id }, select: { type: true } })
    if (!actorUser) {
      throw new UnauthorizedException('Unknown user')
    }

    const before = auditSnapshot(existing)
    const after = correctedSnapshot(existing, dto)

    const [updated] = await this.db.$transaction([
      this.db.passenger.update({
        where: { id },
        data: {
          date_of_birth: dto.dateOfBirth,
          gender: dto.gender,
          nationality: dto.nationality,
          updated_at: new Date(),
        },
        select: SUMMARY_SELECT,
      }),
      this.db.audit_log.create({
        data: {
          occurred_at: new Date(),
          actor_type: actorUser.type,
          actor_id: actor.id,
          source_feature: SOURCE_FEATURE,
          // An existing enum value, not a bespoke one: see {@link AUDIT_UPDATE}.
          action: AUDIT_UPDATE,
          entity_type: 'passenger',
          entity_id: id,
          summary: `Corrected identity for ${existing.first_name} ${existing.last_name}`,
          reason: dto.reason,
          before,
          after,
          // The before/after snapshots describe a person's identity.
          is_sensitive: true,
        },
      }),
    ])

    // Ids only; identity fields are already in the audit row.
    this.logger.log(`Passenger ${id} identity corrected by user ${actor.id}`)

    return toSummary(updated)
  }

  private async buildSearchWhere(q: string, type: PersonType): Promise<Prisma.passengerWhereInput> {
    const where: Prisma.passengerWhereInput = { deleted_at: null }

    const plans = tokenizeQuery(q).map(planToken)
    if (plans.length > 0) {
      // One lookup per term that needs one, all issued together. A term with nothing SQL-only
      // about it does not wait on a query that would return every row anyway.
      const sqlIds = await Promise.all(
        plans.map((plan) => (plan.sql.length > 0 ? this.findPassengerIds(plan.sql) : Promise.resolve<string[]>([]))),
      )

      // Each term has to match something, rather than the whole query being matched against one
      // column at a time. That is what makes a full name work: `Anabel Effertz` finds the row
      // whose first name is one term and last name the other. Single-term queries are unchanged
      // — one group of alternatives, as before.
      where.AND = plans.map((plan, index) => ({
        // The ids a cast needed to produce are one more alternative alongside the columns, so a
        // term matches whichever field carries it. An empty list simply matches nothing.
        OR: plan.sql.length > 0 ? [...plan.clauses, { id: { in: sqlIds[index] } }] : plan.clauses,
      }))
    }

    if (type === 'accountHolder') {
      where.customer = { is: { deleted_at: null } }
    } else if (type === 'traveller') {
      // The complement of the above, so a soft-deleted account does not leave its
      // passenger looking like a traveller.
      where.NOT = { customer: { is: { deleted_at: null } } }
    }

    return where
  }
}
