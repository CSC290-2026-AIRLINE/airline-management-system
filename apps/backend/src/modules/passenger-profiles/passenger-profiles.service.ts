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

/** Split on any run of whitespace, so `"  Anabel   Effertz "` yields the two real terms. */
function tokenizeQuery(q: string): string[] {
  return q.split(/\s+/).filter((token) => token !== '')
}

function containsInsensitive(term: string) {
  return { contains: term, mode: 'insensitive' as const }
}

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD` — the shape the staff UI shows a date of birth in. */
const DATE_PREFIX = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/

/**
 * Turns an ISO date prefix into the half-open range of days it could cover, so
 * `1988` means the whole of 1988 and `1988-03` the whole of March.
 *
 * `date_of_birth` is a `@db.Date`, so it cannot take a `contains` filter the way the
 * text columns do. A range is also what keeps this on `passenger_dob_idx` instead of
 * forcing a cast per row.
 *
 * Returns null for anything that is not a real date prefix, so an ordinary name or
 * passport token never turns into a range, and for a rolled-over day such as
 * `2023-02-30`, which `Date.UTC` would silently push into March.
 */
function dateOfBirthRange(token: string): { gte: Date; lt: Date } | null {
  const match = DATE_PREFIX.exec(token)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = match[2] === undefined ? 1 : Number(match[2])
  const day = match[3] === undefined ? 1 : Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const monthIndex = month - 1
  const start = new Date(Date.UTC(year, monthIndex, day))
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== monthIndex || start.getUTCDate() !== day) {
    return null
  }

  // `Date.UTC` rolls month and year over on its own, so December needs no special case.
  const end =
    match[3] !== undefined
      ? new Date(Date.UTC(year, monthIndex, day + 1))
      : match[2] !== undefined
        ? new Date(Date.UTC(year, monthIndex + 1, 1))
        : new Date(Date.UTC(year + 1, 0, 1))

  return { gte: start, lt: end }
}

/**
 * The columns one search term may match.
 *
 * Every term matches any one of these, and {@link buildSearchWhere} requires every
 * term to match one — which is what lets `Anabel Effertz` find a row where the two
 * words sit in different columns.
 */
function matchClausesFor(token: string): Prisma.passengerWhereInput[] {
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

  // `passenger.id` is a `@db.Uuid`; comparing it to a non-UUID is a Postgres cast error.
  if (looksLikeUuid(token)) {
    clauses.push({ id: token })
  }

  const dob = dateOfBirthRange(token)
  if (dob) {
    clauses.push({ date_of_birth: dob })
  }

  return clauses
}

@Injectable()
export class PassengerProfilesService {
  private readonly logger = new Logger(PassengerProfilesService.name)

  constructor(private readonly db: DbService) {}

  async search(dto: SearchPassengersDto): Promise<PassengerSearchResult> {
    return this.runSearch(this.buildSearchWhere(dto.q, dto.type), dto.page, dto.size)
  }

  /**
   * The account-holder half of {@link search}, for `GET /api/staff/customers`.
   *
   * Identical query, ordering and paging — the only difference is that the split is fixed, so a
   * caller cannot ask this route for travellers.
   */
  async searchAccountHolders(dto: SearchCustomersDto): Promise<PassengerSearchResult> {
    return this.runSearch(this.buildSearchWhere(dto.q, 'accountHolder'), dto.page, dto.size)
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

  private buildSearchWhere(q: string, type: PersonType): Prisma.passengerWhereInput {
    const where: Prisma.passengerWhereInput = { deleted_at: null }

    const tokens = tokenizeQuery(q)
    if (tokens.length > 0) {
      // Each term has to match something, rather than the whole query being matched
      // against one column at a time. That is what makes a full name work: `Anabel
      // Effertz` finds the row whose first name is one term and last name the other.
      // Single-term queries are unchanged — one group of alternatives, as before.
      where.AND = tokens.map((token) => ({ OR: matchClausesFor(token) }))
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
