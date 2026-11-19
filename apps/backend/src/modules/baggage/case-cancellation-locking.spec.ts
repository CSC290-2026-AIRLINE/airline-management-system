jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class AuditService {} }))

import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { BagMatchReviewService } from './bag-match-review.service'
import { PrismaReportRepository } from './prisma-report.repository'

/*
 * Runs the REAL passenger cancellation (PrismaReportRepository) and the REAL staff match review (BagMatchReviewService)
 * concurrently against a fake database that applies PostgreSQL's FOR UPDATE rules: a conflicting lock request waits
 * until the holder's transaction ends, locks are released at commit or rollback, and a transaction that throws has every
 * write undone. Orderings are forced with barriers on the lock model (wait until a named transaction is queued on a
 * named row), never with timers.
 */

const REPORT_ID = '00000000-0000-4000-8000-0000000000a1'
const BOOKING_PASSENGER_ID = '00000000-0000-4000-8000-0000000000b1'
const BAG_ID = '00000000-0000-4000-8000-0000000000c1'
const MATCH_ID = '00000000-0000-4000-8000-0000000000d1'
const STALE_MATCH_ID = '00000000-0000-4000-8000-0000000000d2'
const STAFF_ID = '00000000-0000-4000-8000-0000000000e1'
const ACTOR = { type: 'staff' as const, id: '00000000-0000-4000-8000-0000000000f1', role: 'baggage' }
const NOW = new Date('2026-11-12T08:00:00Z')

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

class RowLocks {
  private readonly holders = new Map<string, object>()
  private waiters: Array<() => void> = []
  private readonly queued = new Map<string, () => void>()
  readonly log: string[] = []

  /** Resolves once `label` is queued behind another transaction's lock on `key`. */
  waitingOn(key: string, label: string): Promise<void> {
    if (this.log.includes(`${label} waits ${key}`)) return Promise.resolve()
    return new Promise((resolve) => this.queued.set(`${label} waits ${key}`, resolve))
  }

  async acquire(key: string, holder: object, label: string): Promise<void> {
    let logged = false
    while (this.holders.has(key) && this.holders.get(key) !== holder) {
      if (!logged) {
        this.log.push(`${label} waits ${key}`)
        this.queued.get(`${label} waits ${key}`)?.()
        logged = true
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.holders.set(key, holder)
    this.log.push(`${label} locked ${key}`)
  }

  release(holder: object): void {
    for (const [key, h] of this.holders) if (h === holder) this.holders.delete(key)
    const waiting = this.waiters
    this.waiters = []
    waiting.forEach((wake) => wake())
  }
}

type Row = Record<string, unknown>

function makeWorld(reportStatus = 'open') {
  const locks = new RowLocks()
  const reports = new Map<string, Row>([
    [
      REPORT_ID,
      {
        id: REPORT_ID,
        case_number: 'LB-2026-000777',
        booking_passenger_id: BOOKING_PASSENGER_ID,
        passenger_id: '00000000-0000-4000-8000-000000000003',
        flight_id: '00000000-0000-4000-8000-000000000004',
        reported_by_customer_id: null,
        reported_by_staff_id: null,
        tag_number: null,
        bag_type: 'suitcase',
        colour: 'black',
        brand: null,
        description: null,
        photo_url: null,
        contact_email: 'passenger@example.com',
        contact_phone: null,
        status: reportStatus,
        reported_at: new Date('2026-11-01T08:00:00Z'),
        lost_at: null,
        closed_at: null,
        created_at: new Date('2026-11-01T08:00:00Z'),
        updated_at: new Date('2026-11-01T08:00:00Z'),
      },
    ],
  ])
  const matches = new Map<string, Row>([
    [MATCH_ID, { id: MATCH_ID, report_id: REPORT_ID, found_bag_id: BAG_ID, match_level: 'strong', status: 'suggested', linked_by: null }],
  ])
  const bags = new Map<string, Row>([[BAG_ID, { id: BAG_ID, status: 'held' }]])
  const deliveries = new Map<string, Row>()
  const audits: Row[] = []
  const events: Row[] = []
  const gates = new Map<string, { locked: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }>()

  /** The next transaction run by `label` pauses right after taking its case lock, until released. */
  function holdAfterCaseLock(label: string) {
    const gate = { locked: deferred(), release: deferred() }
    gates.set(label, gate)
    return gate
  }

  const matchesWhere = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Row[]).some((c) => matchesWhere(row, c))
      if (cond && typeof cond === 'object' && 'in' in cond) return (cond as { in: unknown[] }).in.includes(row[key])
      if (cond && typeof cond === 'object' && 'not' in cond) return row[key] !== cond.not
      return row[key] === cond
    })

  /** One database connection: the label names its transactions in the lock log. */
  function connection(label: string, faults: { auditWrite?: Error; reportUpdate?: Error } = {}) {
    const audit = {
      write: (input: Row, tx: { record: (undo: () => void) => void }) => {
        if (faults.auditWrite) return Promise.reject(faults.auditWrite)
        audits.push(input)
        tx.record(() => audits.pop())
        return Promise.resolve({ id: `audit-${audits.length}`, seq: String(audits.length) })
      },
    }

    function assign(table: Map<string, Row>, key: string, data: Row, undo: Array<() => void>) {
      const before = table.get(key)
      table.set(key, { ...before, ...data })
      undo.push(() => (before ? table.set(key, before) : table.delete(key)))
    }

    async function transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
      const holder = {}
      const undo: Array<() => void> = []
      const tx = {
        record: (fn: () => void) => undo.push(fn),
        $queryRaw: async (strings: TemplateStringsArray, ...values: string[]) => {
          const sql = strings.join('?')
          if (sql.includes('FROM lost_bag_report') && sql.includes('FOR UPDATE')) {
            await locks.acquire(`report:${values[0]}`, holder, label)
            const gate = gates.get(label)
            if (gate) {
              gates.delete(label)
              gate.locked.resolve()
              await gate.release.promise
            }
            const row = reports.get(values[0])
            if (!row || (sql.includes('booking_passenger_id') && row.booking_passenger_id !== values[1])) return []
            return [{ id: row.id, status: row.status, case_number: row.case_number }]
          }
          if (sql.includes('FROM found_bag') && sql.includes('FOR UPDATE')) {
            await locks.acquire(`bag:${values[0]}`, holder, label)
            const row = bags.get(values[0])
            return row ? [{ id: row.id, status: row.status }] : []
          }
          throw new Error(`Unexpected SQL in fake: ${sql}`)
        },
        lost_bag_report: {
          findFirst: ({ where }: { where: Row }) => {
            const row = reports.get(where.id as string)
            if (!row || !matchesWhere(row, where)) return Promise.resolve(null)
            const confirmed = [...matches.values()].filter((m) => m.report_id === row.id && m.status === 'confirmed')
            return Promise.resolve({
              ...row,
              bag_delivery: deliveries.has(row.id as string) ? { id: 'delivery-1' } : null,
              bag_match: confirmed.map((m) => ({ id: m.id })),
            })
          },
          update: ({ where, data }: { where: { id: string }; data: Row }) => {
            if (faults.reportUpdate) return Promise.reject(faults.reportUpdate)
            assign(reports, where.id, data, undo)
            return Promise.resolve(reports.get(where.id))
          },
          updateMany: ({ where, data }: { where: Row; data: Row }) => {
            const hits = [...reports.values()].filter((r) => matchesWhere(r, where))
            hits.forEach((r) => assign(reports, r.id as string, data, undo))
            return Promise.resolve({ count: hits.length })
          },
        },
        bag_match: {
          updateMany: ({ where, data }: { where: Row; data: Row }) => {
            const hits = [...matches.values()].filter((m) => matchesWhere(m, where))
            hits.forEach((m) => assign(matches, m.id as string, data, undo))
            return Promise.resolve({ count: hits.length })
          },
        },
        found_bag: {
          updateMany: ({ where, data }: { where: Row; data: Row }) => {
            const hits = [...bags.values()].filter((b) => matchesWhere(b, where))
            hits.forEach((b) => assign(bags, b.id as string, data, undo))
            return Promise.resolve({ count: hits.length })
          },
        },
        bag_delivery: {
          upsert: ({ where, create }: { where: { report_id: string }; create: Row }) => {
            if (!deliveries.has(where.report_id)) assign(deliveries, where.report_id, create, undo)
            return Promise.resolve(deliveries.get(where.report_id))
          },
        },
      }

      try {
        return await callback(tx)
      } catch (error) {
        undo.reverse().forEach((fn) => fn())
        throw error
      } finally {
        locks.release(holder)
      }
    }

    const db = {
      $transaction: transaction,
      bag_match: {
        // findOpen reads the plain row; getById (after a review) only needs the review to have happened.
        findUnique: ({ where }: { where: { id: string } }) => Promise.resolve(matches.get(where.id) ?? null),
      },
    } as unknown as DbService

    return { db, audit: audit as unknown as AuditService }
  }

  function repository(label: string, faults?: { reportUpdate?: Error }) {
    return new PrismaReportRepository(connection(label, faults).db)
  }

  function review(label: string, faults?: { auditWrite?: Error }) {
    const { db, audit } = connection(label, faults)
    const service = new BagMatchReviewService(db, audit, { now: () => NOW })
    // getById maps the full joined row for the response; the outcome under test is the stored state.
    jest.spyOn(service, 'getById').mockImplementation((id: string) => Promise.resolve({ id } as never))
    return service
  }

  const snapshot = () => ({
    reports: [...reports.values()].map((r) => ({ id: r.id, status: r.status, closed_at: r.closed_at })),
    matches: [...matches.values()].map((m) => ({ id: m.id, status: m.status, review_note: m.review_note ?? null })),
    bags: [...bags.values()].map((b) => ({ ...b })),
    deliveries: [...deliveries.values()].map((d) => ({ ...d })),
    audits: audits.map((a) => ({ entityType: a.entityType, entityId: a.entityId })),
    events: events.length,
  })

  return { locks, reports, matches, bags, deliveries, audits, holdAfterCaseLock, repository, review, snapshot }
}

const cancel = (world: ReturnType<typeof makeWorld>, label = 'cancel', faults?: { reportUpdate?: Error }) =>
  world.repository(label, faults).cancelIfNotDispatched(REPORT_ID, BOOKING_PASSENGER_ID, NOW)

const confirmInput = { staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'Tag and strap match' }

describe('Passenger cancellation vs staff match review, under PostgreSQL row-lock rules', () => {
  it('cancellation locks first: confirmation waits, then fails, and nothing of it commits', async () => {
    const world = makeWorld()
    const gate = world.holdAfterCaseLock('cancel')

    const cancelling = cancel(world)
    await gate.locked.promise
    const confirming = world.review('confirm').confirm(confirmInput)
    await world.locks.waitingOn(`report:${REPORT_ID}`, 'confirm')
    gate.release.resolve()

    await expect(cancelling).resolves.toMatchObject({ status: 'cancelled' })
    await expect(confirming).rejects.toMatchObject({ code: 'MATCH_CLOSED' })
    expect(world.snapshot()).toEqual({
      reports: [{ id: REPORT_ID, status: 'cancelled', closed_at: NOW }],
      matches: [{ id: MATCH_ID, status: 'suggested', review_note: null }],
      bags: [{ id: BAG_ID, status: 'held' }],
      deliveries: [],
      audits: [],
      events: 0,
    })
    // The confirmation never took the bag lock: it stopped at the case.
    expect(world.locks.log).toEqual([
      `cancel locked report:${REPORT_ID}`,
      `confirm waits report:${REPORT_ID}`,
      `confirm locked report:${REPORT_ID}`,
    ])
  })

  it('confirmation locks first: cancellation waits, sees the confirmed match and changes nothing', async () => {
    const world = makeWorld()
    const gate = world.holdAfterCaseLock('confirm')

    const confirming = world.review('confirm').confirm(confirmInput)
    await gate.locked.promise
    const cancelling = cancel(world)
    await world.locks.waitingOn(`report:${REPORT_ID}`, 'cancel')
    gate.release.resolve()

    await expect(confirming).resolves.toBeDefined()
    const afterConfirmation = world.snapshot()
    await expect(cancelling).resolves.toBeNull()

    expect(world.snapshot()).toEqual(afterConfirmation)
    expect(afterConfirmation).toMatchObject({
      reports: [{ status: 'matched', closed_at: null }],
      matches: [{ status: 'confirmed' }],
      bags: [{ status: 'matched' }],
      deliveries: [{ report_id: REPORT_ID, status: 'waiting_choice' }],
      audits: [{ entityType: 'bag_match', entityId: MATCH_ID }],
    })
  })

  it('cancellation locks first: a rejection waits and is not recorded as a "not the same bag" decision', async () => {
    const world = makeWorld()
    const gate = world.holdAfterCaseLock('cancel')

    const cancelling = cancel(world)
    await gate.locked.promise
    const rejecting = world.review('reject').reject({ ...confirmInput, note: 'Different strap' })
    await world.locks.waitingOn(`report:${REPORT_ID}`, 'reject')
    gate.release.resolve()

    await expect(cancelling).resolves.toMatchObject({ status: 'cancelled' })
    await expect(rejecting).rejects.toMatchObject({ code: 'MATCH_CLOSED' })
    expect(world.snapshot()).toMatchObject({ matches: [{ status: 'suggested' }], audits: [] })
  })

  it('rejection locks first: it is recorded, and the still-unconfirmed case can then be cancelled', async () => {
    const world = makeWorld()
    const gate = world.holdAfterCaseLock('reject')

    const rejecting = world.review('reject').reject({ ...confirmInput, note: 'Different strap' })
    await gate.locked.promise
    const cancelling = cancel(world)
    await world.locks.waitingOn(`report:${REPORT_ID}`, 'cancel')
    gate.release.resolve()

    await expect(rejecting).resolves.toBeDefined()
    await expect(cancelling).resolves.toMatchObject({ status: 'cancelled' })
    expect(world.snapshot()).toMatchObject({
      reports: [{ status: 'cancelled' }],
      matches: [{ status: 'rejected', review_note: 'Different strap' }],
      bags: [{ status: 'held' }],
      audits: [{ entityType: 'bag_match', entityId: MATCH_ID }],
    })
  })

  it.each(['open', 'lost'])('cancels an unconfirmed %s case without touching its pending suggestion or the bag', async (status) => {
    const world = makeWorld(status)

    await expect(cancel(world)).resolves.toMatchObject({ status: 'cancelled' })

    expect(world.snapshot()).toMatchObject({
      matches: [{ status: 'suggested' }],
      bags: [{ status: 'held' }],
      deliveries: [],
      audits: [],
      events: 0,
    })
  })

  it('a suggestion written after the case was cancelled stays stored but cannot be confirmed or rejected', async () => {
    const world = makeWorld()
    await cancel(world)
    // An in-flight matcher read the case while it was open and inserted its suggestion after the cancellation.
    world.matches.set(STALE_MATCH_ID, {
      id: STALE_MATCH_ID,
      report_id: REPORT_ID,
      found_bag_id: BAG_ID,
      match_level: 'possible',
      status: 'suggested',
      linked_by: null,
    })
    const before = world.snapshot()

    await expect(world.review('confirm').confirm({ ...confirmInput, matchId: STALE_MATCH_ID })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
    await expect(world.review('reject').reject({ ...confirmInput, matchId: STALE_MATCH_ID })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })

    expect(world.snapshot()).toEqual(before)
    expect(world.matches.get(STALE_MATCH_ID)).toMatchObject({ status: 'suggested' })
  })

  it('rolls back every confirmation write when its audit row fails, so the case can still be cancelled', async () => {
    const world = makeWorld()
    const before = world.snapshot()

    await expect(world.review('confirm', { auditWrite: new Error('audit down') }).confirm(confirmInput)).rejects.toThrow('audit down')

    expect(world.snapshot()).toEqual(before)
    await expect(cancel(world)).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('rolls back a rejection whose audit row fails', async () => {
    const world = makeWorld()
    const before = world.snapshot()

    await expect(world.review('reject', { auditWrite: new Error('audit down') }).reject(confirmInput)).rejects.toThrow('audit down')

    expect(world.snapshot()).toEqual(before)
  })

  it('leaves the case as it was when the cancellation write fails, and releases the case lock', async () => {
    const world = makeWorld()
    const before = world.snapshot()

    await expect(cancel(world, 'cancel', { reportUpdate: new Error('write failed') })).rejects.toThrow('write failed')

    expect(world.snapshot()).toEqual(before)
    await expect(world.review('confirm').confirm(confirmInput)).resolves.toBeDefined()
  })
})
