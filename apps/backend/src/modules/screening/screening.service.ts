import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma, screening_check, screening_review } from '@backend/db/generated/prisma/client'
import { QueueDto, ReviewDto, ReviewPipe, uuid } from './dto/screening.dto'
import { ScreeningAudit, ScreeningContext } from './screening.context'
import { bangkokDay, classify, clearance, snapshotIdentity } from './screening.rules'
import { identityChecks } from './screening-check.service'
import { ScreeningBookingPort, ScreeningNotificationPort } from './screening.ports'

const reviewInclude = { staff: { select: { first_name: true, last_name: true } } } satisfies Prisma.screening_reviewInclude
const readInclude = {
  flight: { select: { id: true, flight_number: true, dep_at: true, status: true, route: { select: { origin: true, destination: true } } } },
  screening_review: { orderBy: { revision: 'desc' }, take: 1, include: reviewInclude },
} satisfies Prisma.screening_checkInclude

type QueueRow = Prisma.screening_checkGetPayload<{ include: typeof readInclude }>
type ReviewRow = screening_review & { staff: { first_name: string; last_name: string } }
function reviewResponse(row: ReviewRow, passportCompared: boolean | null = null) {
  return {
    id: row.id,
    revision: row.revision,
    decision: row.decision,
    note: row.review_note,
    by: `${row.staff.first_name} ${row.staff.last_name}`,
    reviewedAt: row.reviewed_at.toISOString(),
    authorityNotifiedAt: row.authority_notified_at?.toISOString() ?? null,
    notificationMode: row.authority_notified_at ? 'mock' : null,
    passportCompared,
    passportComparisonEvidence: passportCompared ? 'audit' : 'not_available',
  }
}
function checkResponse(row: QueueRow, now: Date) {
  const review = row.screening_review[0]
  const departure = row.flight.dep_at.getTime() - now.getTime()
  return {
    id: row.id,
    runId: row.run_id,
    passengerId: row.passenger_id,
    watchlistEntryId: row.watchlist_entry_id,
    name: `${row.snap_first_name} ${row.snap_last_name}`,
    triggerPoint: row.trigger_point,
    outcome: row.outcome,
    match: row.match_level,
    matchReason: row.watchlist_entry_id
      ? classify(snapshotIdentity(row), snapshotIdentity(row, true), row.name_similarity ?? 0).reason
      : 'none',
    status: review
      ? review.decision === 'confirmed'
        ? 'Confirmed'
        : 'Released'
      : row.outcome === 'held'
        ? 'Held'
        : row.outcome === 'flagged'
          ? 'Flagged'
          : 'Clear',
    occurredAt: row.occurred_at.toISOString(),
    similarity: row.name_similarity,
    flight: {
      id: row.flight.id,
      label: `${row.flight.flight_number} · ${row.flight.route.origin} → ${row.flight.route.destination}`,
      departureAt: row.flight.dep_at.toISOString(),
      status: row.flight.status,
    },
    urgent: !review && row.outcome !== 'clear' && departure > 0 && departure <= 3 * 60 * 60 * 1000,
    latestReview: review ? reviewResponse(review) : null,
  }
}
function identityResponse(row: screening_check, entry = false) {
  const identity = snapshotIdentity(row, entry)
  return {
    firstName: identity.first_name,
    lastName: identity.last_name,
    dateOfBirth: identity.date_of_birth?.toISOString().slice(0, 10) ?? null,
    gender: identity.gender,
    nationality: identity.nationality,
    // Security detail is authorized and audited; the UI displays only the last four characters.
    passportNumber: identity.passport_number,
    passportLast4: identity.passport_number?.slice(-4) ?? null,
  }
}

type Anchor = { rank: number; primary: string; departure: string; id: string }
type PageRow = { id: string; rank: number; primary_at: Date; dep_at: Date }
function cursorScope(query: QueueDto, now: Date) {
  return JSON.stringify([query.status, query.sort, query.q, query.status === 'decided' ? bangkokDay(now).start.toISOString() : null])
}
function decodeCursor(query: QueueDto, now: Date): Anchor | null {
  if (!query.cursor) return null
  try {
    const data = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as { scope: unknown; anchor: Anchor }
    const a = data.anchor
    if (
      data.scope !== cursorScope(query, now) ||
      !a ||
      !Number.isInteger(a.rank) ||
      a.rank < 0 ||
      a.rank > 3 ||
      typeof a.primary !== 'string' ||
      typeof a.departure !== 'string' ||
      !Number.isFinite(Date.parse(a.primary)) ||
      !Number.isFinite(Date.parse(a.departure)) ||
      typeof a.id !== 'string' ||
      !uuid(a.id)
    )
      throw new Error('cursor')
    return a
  } catch {
    throw new BadRequestException('Invalid cursor or changed filters; start a new page')
  }
}

@Injectable()
export class ScreeningService {
  constructor(
    private readonly context: ScreeningContext,
    private readonly audit: ScreeningAudit,
    private readonly bookings: ScreeningBookingPort,
    private readonly notifications: ScreeningNotificationPort,
  ) {}

  async list(userId: string, query: QueueDto) {
    return this.context.run(userId, async (tx, actor, now) => {
      const { start, end } = bangkokDay(now)
      const cursor = decodeCursor(query, now)
      const search = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
      const pages = await tx.$queryRaw<PageRow[]>`
        WITH candidates AS (
          SELECT c.id, date_trunc('milliseconds', f.dep_at) AS dep_at,
            CASE WHEN ${query.sort} = 'match' THEN CASE c.match_level WHEN 'strong' THEN 0 WHEN 'probable' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END ELSE 0 END AS rank,
            CASE WHEN ${query.sort} = 'waiting' THEN date_trunc('milliseconds', c.occurred_at) ELSE date_trunc('milliseconds', f.dep_at) END AS primary_at
          FROM screening_check c JOIN flight f ON f.id = c.flight_id JOIN route route ON route.id = f.route_id
          LEFT JOIN LATERAL (SELECT r.reviewed_at FROM screening_review r WHERE r.screening_check_id = c.id ORDER BY r.revision DESC LIMIT 1) latest ON true
          WHERE c.outcome IN ('held', 'flagged') AND (
            (${query.status} = 'decided' AND latest.reviewed_at >= ${start} AND latest.reviewed_at < ${end})
            OR (${query.status} <> 'decided' AND latest.reviewed_at IS NULL
              AND (${query.status} = 'needs-review' OR c.outcome = ${query.status}))
          ) AND (${query.q} = '' OR (c.snap_first_name || ' ' || c.snap_last_name) ILIKE ${search} OR (f.flight_number || ' ' || route.origin || ' ' || route.destination) ILIKE ${search})
        )
        SELECT * FROM candidates
        WHERE ${cursor === null} OR (rank, primary_at, dep_at, id) >
          (${cursor?.rank ?? 0}::integer, ${cursor?.primary ?? now.toISOString()}::timestamptz,
            ${cursor?.departure ?? now.toISOString()}::timestamptz, ${cursor?.id ?? '00000000-0000-4000-8000-000000000000'}::uuid)
        ORDER BY rank, primary_at, dep_at, id LIMIT ${query.limit + 1}
      `
      const [counts] = await tx.$queryRaw<{ held: number; flagged: number; decided: number }[]>`
        SELECT (count(*) FILTER (WHERE c.outcome = 'held' AND latest.reviewed_at IS NULL))::integer AS held,
          (count(*) FILTER (WHERE c.outcome = 'flagged' AND latest.reviewed_at IS NULL))::integer AS flagged,
          (count(*) FILTER (WHERE latest.reviewed_at >= ${start} AND latest.reviewed_at < ${end}))::integer AS decided
        FROM screening_check c
        LEFT JOIN LATERAL (SELECT r.reviewed_at FROM screening_review r WHERE r.screening_check_id = c.id ORDER BY r.revision DESC LIMIT 1) latest ON true
        WHERE c.outcome IN ('held', 'flagged')
      `
      const page = pages.slice(0, query.limit)
      const rows = await tx.screening_check.findMany({ where: { id: { in: page.map((row) => row.id) } }, include: readInclude })
      const byId = new Map(rows.map((row) => [row.id, row]))
      const last = page.at(-1)
      const nextCursor =
        pages.length > query.limit && last
          ? Buffer.from(
              JSON.stringify({
                scope: cursorScope(query, now),
                anchor: {
                  rank: last.rank,
                  primary: last.primary_at.toISOString(),
                  departure: last.dep_at.toISOString(),
                  id: last.id,
                },
              }),
            ).toString('base64url')
          : null
      await this.audit.record(tx, actor, now, 'view_sensitive', 'screening_queue')
      return {
        items: page.map((row) => checkResponse(byId.get(row.id)!, now)),
        nextCursor,
        counts: { needsReview: counts.held + counts.flagged, ...counts },
        now: now.toISOString(),
        timeZone: 'Asia/Bangkok',
      }
    })
  }

  async detail(userId: string, id: string) {
    return this.context.run(userId, async (tx, actor, now) => {
      const row = await tx.screening_check.findUnique({
        where: { id },
        include: {
          ...readInclude,
          watchlist_entry: { select: { list_type: true, issuing_authority: true, reason: true, listed_at: true, status: true } },
          screening_review: { orderBy: { revision: 'desc' }, include: reviewInclude },
        },
      })
      if (!row) throw new NotFoundException('Screening check was not found')
      const history = await tx.screening_check.findMany({
        where: {
          flight_id: row.flight_id,
          passenger_id: row.passenger_id,
          watchlist_entry_id: row.watchlist_entry_id,
        },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        include: {
          screening_review: { orderBy: { revision: 'asc' }, include: reviewInclude },
        },
      })
      const evidence = await tx.audit_log.findMany({
        where: {
          source_feature: '7',
          action: 'create',
          entity_type: 'screening_review',
          entity_id: { in: row.screening_review.map((review) => review.id) },
        },
        select: { entity_id: true, after: true },
      })
      const compared = new Set(
        evidence
          .filter(
            (event) =>
              event.after && typeof event.after === 'object' && !Array.isArray(event.after) && event.after.passportCompared === true,
          )
          .map((event) => event.entity_id),
      )
      await this.audit.record(tx, actor, now, 'view_sensitive', 'screening_check', id)
      return {
        ...checkResponse(row, now),
        latestReview: row.screening_review[0]
          ? reviewResponse(row.screening_review[0], compared.has(row.screening_review[0].id) ? true : null)
          : null,
        snapshot: { passenger: identityResponse(row), entry: row.watchlist_entry_id ? identityResponse(row, true) : null },
        watchlist: row.watchlist_entry
          ? {
              listType: row.watchlist_entry.list_type,
              issuingAuthority: row.watchlist_entry.issuing_authority,
              reason: row.watchlist_entry.reason,
              listedAt: row.watchlist_entry.listed_at.toISOString(),
              status: row.watchlist_entry.status,
              source: 'current_metadata',
            }
          : null,
        booking: await this.bookings.get(row.pnr_id),
        reviews: row.screening_review.map((review) => reviewResponse(review, compared.has(review.id) ? true : null)),
        history: history.map((check) => ({
          id: check.id,
          triggerPoint: check.trigger_point,
          match: check.match_level,
          outcome: check.outcome,
          occurredAt: check.occurred_at.toISOString(),
          reviews: check.screening_review.map((review) => reviewResponse(review)),
        })),
        now: now.toISOString(),
        timeZone: 'Asia/Bangkok',
      }
    })
  }

  async review(userId: string, id: string, request: ReviewDto) {
    const input = new ReviewPipe().transform(request)
    return this.context.run(userId, async (tx, actor, now) => {
      const row = await tx.screening_check.findUnique({
        where: { id },
        include: {
          screening_review: { orderBy: { revision: 'desc' }, take: 1 },
        },
      })
      if (!row) throw new NotFoundException('Screening check was not found')
      if (row.outcome === 'clear' || !row.watchlist_entry_id) throw new BadRequestException('A clear check cannot be reviewed')
      const previous = row.screening_review[0]
      if ((previous?.revision ?? 0) !== input.expectedRevision) throw new ConflictException('Decision changed, please reload')
      if (now < row.occurred_at || (previous && now < previous.reviewed_at))
        throw new BadRequestException('A review cannot predate the check or previous review')
      const notification = input.decision === 'confirmed' ? this.notifications.confirm(now) : null
      const review = await tx.screening_review.create({
        data: {
          screening_check_id: id,
          revision: input.expectedRevision + 1,
          decision: input.decision,
          review_note: input.note,
          reviewed_by_staff_id: actor.staffId,
          reviewed_at: now,
          authority_notified_at: notification?.authorityNotifiedAt ?? null,
        },
        include: reviewInclude,
      })
      await this.audit.record(tx, actor, now, 'create', 'screening_review', review.id, {
        screeningCheckId: id,
        revision: review.revision,
        decision: input.decision,
        passportCompared: true,
        notificationMode: notification?.mode ?? null,
      })
      return {
        review: reviewResponse(review, true),
        clearance: clearance(await identityChecks(tx, row.flight_id, snapshotIdentity(row)), snapshotIdentity(row)),
        integrations: { checkIn: 'not_connected', notification: notification?.mode ?? 'not_requested', audit: 'database' },
      }
    })
  }
}
