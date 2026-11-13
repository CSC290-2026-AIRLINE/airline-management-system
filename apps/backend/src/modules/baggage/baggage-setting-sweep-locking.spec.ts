jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({
  AuditService: class AuditService {
    static systemActor() {
      return { type: 'system', id: null, role: null }
    }
  },
}))

import type { DbService } from '@backend/db/db.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { BaggageSettingsService } from './baggage-settings.service'
import { FoundBagLifecycleService } from './found-bag-lifecycle.service'
import { LostReportLifecycleService } from './lost-report-lifecycle.service'

/*
 * Runs the REAL settings API and the REAL lifecycle sweeps concurrently against a fake database that applies
 * PostgreSQL's row-lock rules: FOR SHARE is compatible with FOR SHARE, FOR UPDATE conflicts with both, a blocked
 * request waits until the holder's transaction ends, locks are released at commit, writes become visible on commit,
 * and a reader that waited sees the newly committed value (READ COMMITTED).
 */

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-12T00:00:00Z')
const ADMIN = '00000000-0000-4000-8000-0000000000ad'
const ACTOR = { type: 'staff' as const, id: 'user-1', role: 'admin' }
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS)

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

/** Lets every pending promise and lock waiter run. */
async function settle() {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setImmediate(resolve))
}

class RowLocks {
  private readonly rows = new Map<string, { exclusive: object | null; shared: Set<object> }>()
  private waiters: Array<() => void> = []
  readonly log: string[] = []

  private entry(key: string) {
    let e = this.rows.get(key)
    if (!e) this.rows.set(key, (e = { exclusive: null, shared: new Set() }))
    return e
  }

  private grantable(key: string, holder: object, mode: 'share' | 'update') {
    const e = this.entry(key)
    if (e.exclusive && e.exclusive !== holder) return false
    return mode === 'share' || [...e.shared].every((h) => h === holder)
  }

  async acquire(key: string, holder: object, mode: 'share' | 'update', label: string) {
    let logged = false
    while (!this.grantable(key, holder, mode)) {
      if (!logged) this.log.push(`${label} waits ${mode} ${key}`)
      logged = true
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    const e = this.entry(key)
    if (mode === 'update') e.exclusive = holder
    else e.shared.add(holder)
    this.log.push(`${label} locked ${mode} ${key}`)
  }

  release(holder: object) {
    for (const e of this.rows.values()) {
      if (e.exclusive === holder) e.exclusive = null
      e.shared.delete(holder)
    }
    const waiting = this.waiters
    this.waiters = []
    waiting.forEach((wake) => wake())
  }
}

type Gate = Promise<void> | undefined

function makeWorld() {
  const settings = new Map<string, string>([
    ['lost_after_days', '21'],
    ['unclaimed_after_days', '90'],
  ])
  // Due under the current thresholds, NOT due after the planned increases (90 -> 120, 21 -> 30).
  const foundBags = [{ id: 'fb-100-days', status: 'held', found_at: daysAgo(100) }]
  const reports = [{ id: 'r-25-days', status: 'open', lost_at: null as Date | null, reported_at: daysAgo(25) }]
  const locks = new RowLocks()
  const commits: string[] = []
  const reached = { foundBagRead: false, lostReportLock: false }
  const gates: { foundBagRead?: Gate; lostReportLock?: Gate; settingsAudit?: Gate } = {}
  let txCount = 0

  function makeTx(label: string) {
    const holder = {}
    const writes: Array<() => void> = []
    const tx = {
      label,
      holder,
      writes,
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?')
        if (sql.includes('FROM baggage_setting') && sql.includes('FOR SHARE')) {
          const key = values[0] as string
          await locks.acquire(key, holder, 'share', label)
          const value = settings.get(key) // read AFTER the lock is granted: the latest committed value
          return value === undefined ? [] : [{ value }]
        }
        if (sql.includes('FROM baggage_setting') && sql.includes('FOR UPDATE')) {
          for (const key of ['lost_after_days', 'unclaimed_after_days']) await locks.acquire(key, holder, 'update', label)
          return [...settings.entries()].map(([key, value]) => ({ key, value }))
        }
        if (sql.includes('FROM lost_bag_report')) {
          reached.lostReportLock = true
          await gates.lostReportLock
          const cutoff = values[0] as Date
          return reports.filter((r) => r.status === 'open' && r.lost_at === null && r.reported_at <= cutoff).map(({ id }) => ({ id }))
        }
        throw new Error(`unexpected SQL: ${sql}`)
      },
      baggage_setting: {
        update: ({ where, data }: { where: { key: string }; data: { value: string } }) => {
          writes.push(() => settings.set(where.key, data.value))
          return Promise.resolve({})
        },
      },
      found_bag: {
        findMany: async ({ where }: { where: { found_at: { lte: Date } } }) => {
          reached.foundBagRead = true
          await gates.foundBagRead
          return foundBags.filter((b) => b.status === 'held' && b.found_at <= where.found_at.lte).map(({ id }) => ({ id }))
        },
        updateManyAndReturn: ({ where, data }: { where: { id: { in: string[] }; found_at: { lte: Date } }; data: { status: string } }) => {
          const hits = foundBags.filter((b) => where.id.in.includes(b.id) && b.status === 'held' && b.found_at <= where.found_at.lte)
          writes.push(() => hits.forEach((b) => (b.status = data.status)))
          return Promise.resolve(hits.map(({ id }) => ({ id })))
        },
      },
      lost_bag_report: {
        updateMany: ({
          where,
          data,
        }: {
          where: { id: { in: string[] }; reported_at: { lte: Date } }
          data: { status: string; lost_at: Date }
        }) => {
          const hits = reports.filter((r) => where.id.in.includes(r.id) && r.status === 'open' && r.reported_at <= where.reported_at.lte)
          writes.push(() => hits.forEach((r) => Object.assign(r, { status: data.status, lost_at: data.lost_at })))
          return Promise.resolve({ count: hits.length })
        },
      },
    }
    return tx
  }

  const db = {
    baggage_setting: {
      findMany: () => Promise.resolve([...settings.entries()].map(([key, value]) => ({ key, value, updated_at: NOW, updated_by: ADMIN }))),
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = makeTx(`tx${++txCount}`)
      try {
        const result = await callback(tx)
        tx.writes.forEach((write) => write())
        commits.push(tx.label)
        return result
      } finally {
        locks.release(tx.holder)
      }
    },
  }

  const audit = {
    write: async (input: { entityType: string }) => {
      if (input.entityType === 'baggage_setting') await gates.settingsAudit
      return { id: 'audit', seq: '1' }
    },
  }

  const asDb = db as unknown as DbService
  const asAudit = audit as unknown as AuditService
  return {
    settings,
    foundBags,
    reports,
    locks,
    commits,
    reached,
    gates,
    settingsApi: new BaggageSettingsService(asDb, asAudit),
    foundSweep: new FoundBagLifecycleService(asDb, asAudit, { now: () => NOW }),
    lostSweep: new LostReportLifecycleService(asDb, { now: () => NOW }),
  }
}

function track<T>(promise: Promise<T>) {
  const state = { done: false }
  void promise.then(
    () => (state.done = true),
    () => (state.done = true),
  )
  return state
}

const raise = (lostAfterDays: number, unclaimedAfterDays: number) => ({ lostAfterDays, unclaimedAfterDays, staffId: ADMIN, actor: ACTOR })

describe('Lifecycle sweeps vs. the settings API: the threshold is read under a lock in the sweep transaction', () => {
  describe('unclaimed sweep (unclaimed_after_days 90 -> 120)', () => {
    it('sweep locks first: it finishes with the old value before the increase can commit', async () => {
      const w = makeWorld()
      const pause = deferred()
      w.gates.foundBagRead = pause.promise

      const sweep = w.foundSweep.markUnclaimed()
      await settle()
      expect(w.locks.log).toContain('tx1 locked share unclaimed_after_days')

      const put = w.settingsApi.update(raise(21, 120))
      const putState = track(put)
      await settle()
      expect(w.locks.log).toContain('tx2 waits update unclaimed_after_days')
      expect(putState.done).toBe(false)
      expect(w.settings.get('unclaimed_after_days')).toBe('90')

      pause.resolve()
      await expect(sweep).resolves.toMatchObject({ unclaimedAfterDays: 90, marked: 1 })
      await expect(put).resolves.toMatchObject({ unclaimedAfterDays: 120 })
      expect(w.commits).toEqual(['tx1', 'tx2'])
      expect(w.foundBags[0].status).toBe('unclaimed')
    })

    it('increase locks first: the sweep waits, then applies the newly committed value', async () => {
      const w = makeWorld()
      const pause = deferred()
      w.gates.settingsAudit = pause.promise

      const put = w.settingsApi.update(raise(21, 120))
      await settle()
      expect(w.locks.log).toContain('tx1 locked update unclaimed_after_days')

      const sweep = w.foundSweep.markUnclaimed()
      const sweepState = track(sweep)
      await settle()
      expect(w.locks.log).toContain('tx2 waits share unclaimed_after_days')
      expect(sweepState.done).toBe(false)
      expect(w.reached.foundBagRead).toBe(false)

      pause.resolve()
      await expect(put).resolves.toMatchObject({ unclaimedAfterDays: 120 })
      await expect(sweep).resolves.toMatchObject({ unclaimedAfterDays: 120, marked: 0 })
      expect(w.commits).toEqual(['tx1', 'tx2'])
      expect(w.foundBags[0].status).toBe('held')
    })
  })

  describe('lost sweep (lost_after_days 21 -> 30)', () => {
    it('sweep locks first: it finishes with the old value before the increase can commit', async () => {
      const w = makeWorld()
      const pause = deferred()
      w.gates.lostReportLock = pause.promise

      const sweep = w.lostSweep.markTimedOutReports()
      await settle()
      expect(w.locks.log).toContain('tx1 locked share lost_after_days')

      const put = w.settingsApi.update(raise(30, 90))
      const putState = track(put)
      await settle()
      expect(w.locks.log).toContain('tx2 waits update lost_after_days')
      expect(putState.done).toBe(false)

      pause.resolve()
      await expect(sweep).resolves.toMatchObject({ lostAfterDays: 21, marked: 1 })
      await expect(put).resolves.toMatchObject({ lostAfterDays: 30 })
      expect(w.commits).toEqual(['tx1', 'tx2'])
      expect(w.reports[0].status).toBe('lost')
    })

    it('increase locks first: the sweep waits, then applies the newly committed value', async () => {
      const w = makeWorld()
      const pause = deferred()
      w.gates.settingsAudit = pause.promise

      const put = w.settingsApi.update(raise(30, 90))
      await settle()
      expect(w.locks.log).toContain('tx1 locked update lost_after_days')

      const sweep = w.lostSweep.markTimedOutReports()
      const sweepState = track(sweep)
      await settle()
      expect(w.locks.log).toContain('tx2 waits share lost_after_days')
      expect(sweepState.done).toBe(false)
      expect(w.reached.lostReportLock).toBe(false)

      pause.resolve()
      await expect(put).resolves.toMatchObject({ lostAfterDays: 30 })
      await expect(sweep).resolves.toMatchObject({ lostAfterDays: 30, marked: 0 })
      expect(w.commits).toEqual(['tx1', 'tx2'])
      expect(w.reports[0].status).toBe('open')
    })
  })

  it('no wait cycle: both sweeps share-lock, the settings change waits for both, and everything completes', async () => {
    const w = makeWorld()
    const pauseLost = deferred()
    const pauseFound = deferred()
    w.gates.lostReportLock = pauseLost.promise
    w.gates.foundBagRead = pauseFound.promise

    const lost = w.lostSweep.markTimedOutReports()
    const found = w.foundSweep.markUnclaimed()
    await settle()
    const put = w.settingsApi.update(raise(30, 120))
    const putState = track(put)
    await settle()
    expect(putState.done).toBe(false)

    pauseFound.resolve()
    pauseLost.resolve()
    await expect(Promise.all([lost, found, put])).resolves.toEqual([
      expect.objectContaining({ lostAfterDays: 21, marked: 1 }),
      expect.objectContaining({ unclaimedAfterDays: 90, marked: 1 }),
      expect.objectContaining({ lostAfterDays: 30, unclaimedAfterDays: 120 }),
    ])
    expect(w.commits[w.commits.length - 1]).toBe('tx3')
  })
})
