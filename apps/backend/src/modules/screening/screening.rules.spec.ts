import { bangkokDay, classify, clearance, initialOutcome, latestReview, sameIdentity, snapshotIdentity, triggers } from './screening.rules'
import { checkFixture, entryFixture, passengerFixture, reviewFixture } from './screening.test-fixtures'

describe('Screening rules', () => {
  const p = passengerFixture()
  it('gives passport and nationality priority over name or DOB', () => {
    expect(classify(p, entryFixture({ passport_number: p.passport_number, nationality: p.nationality }), 0).level).toBe('strong')
  })
  it.each([
    [0.499, 'none'],
    [0.5, 'probable'],
    [0.99, 'probable'],
  ] as const)('same DOB at score %s becomes %s', (score, expected) => {
    expect(classify(p, entryFixture({ date_of_birth: p.date_of_birth }), score).level).toBe(expected)
  })
  it.each([
    [0.599, 'none'],
    [0.6, 'weak'],
    [1, 'weak'],
  ] as const)('different or missing DOB at score %s becomes %s', (score, expected) => {
    expect(classify(p, entryFixture(), score).level).toBe(expected)
    expect(classify(p, entryFixture({ date_of_birth: null }), score).level).toBe(expected)
  })
  it('does not invent a passport-only probable rule', () => {
    expect(classify(p, entryFixture({ passport_number: p.passport_number, nationality: null }), 0).level).toBe('none')
  })
  it.each(triggers)('only check_in holds strong/probable; %s follows the outcome table', (trigger) => {
    expect(initialOutcome('strong', trigger)).toBe(trigger === 'check_in' ? 'held' : 'flagged')
    expect(initialOutcome('probable', trigger)).toBe(trigger === 'check_in' ? 'held' : 'flagged')
    expect(initialOutcome('weak', trigger)).toBe('flagged')
    expect(initialOutcome('none', trigger)).toBe('clear')
  })
  it('recognizes identity copies by passport/nationality but never falls back when passports differ', () => {
    expect(sameIdentity(p, { ...p, id: 'another-row' })).toBe(true)
    expect(sameIdentity(p, { ...p, passport_number: 'OTHER' })).toBe(false)
    expect(sameIdentity({ ...p, passport_number: null }, { ...p, id: 'copy', passport_number: null })).toBe(true)
  })
  it('keeps a same-row identity with missing DOB/passport recognizable without merging unrelated people', () => {
    const incomplete = { ...p, passport_number: null, date_of_birth: null }
    expect(sameIdentity(incomplete, incomplete)).toBe(true)
    expect(sameIdentity(incomplete, { ...incomplete, id: 'copy' })).toBe(false)
  })
  it('uses revision, not simulated timestamps, to pick the latest decision', () => {
    expect(
      latestReview([reviewFixture({ revision: 2 }), reviewFixture({ revision: 1, reviewed_at: new Date('2030-01-01') })])?.revision,
    ).toBe(2)
  })
  it('releasing one entry does not release another held entry or a confirmed entry', () => {
    const one = { ...checkFixture(), screening_review: [reviewFixture()] }
    const two = { ...checkFixture({ id: 'second', watchlist_entry_id: 'entry-b' }), screening_review: [] }
    expect(clearance([one, two], p)).toBe('held')
    expect(clearance([one], p)).toBe('clear')
    expect(clearance([{ ...one, screening_review: [reviewFixture({ decision: 'confirmed' })] }, two], p)).toBe('denied')
  })
  it('does not let a false positive on one check hide another held or confirmed check for the same entry', () => {
    const released = { ...checkFixture(), screening_review: [reviewFixture()] }
    const pending = { ...checkFixture({ id: 'second-check' }), screening_review: [] }
    expect(clearance([released, pending], p)).toBe('held')
    const confirmed = { ...pending, screening_review: [reviewFixture({ decision: 'confirmed', created_at: new Date('2026-01-01') })] }
    expect(clearance([confirmed, released], p)).toBe('denied')
  })
  it('a correction overrides the earlier decision without altering the immutable outcome', () => {
    const check = { ...checkFixture(), screening_review: [reviewFixture({ decision: 'confirmed' }), reviewFixture({ revision: 2 })] }
    expect(clearance([check], snapshotIdentity(check))).toBe('clear')
    expect(check.outcome).toBe('held')
  })
  it('uses the Bangkok day boundary across UTC midnight', () => {
    expect(bangkokDay(new Date('2026-11-04T17:00:00Z'))).toEqual({
      start: new Date('2026-11-04T17:00:00Z'),
      end: new Date('2026-11-05T17:00:00Z'),
    })
  })
})
