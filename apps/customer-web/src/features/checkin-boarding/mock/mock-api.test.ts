import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiRequestError } from '../api/client.ts'
import { SPECIMEN_LINE1, buildSpecimenLine2 } from '../domain/mrz.ts'
import { DEMO_NOW } from './fixtures.ts'
import { createMockApi } from './mock-api.ts'

function isCode(code: string) {
  return (e: unknown) => e instanceof ApiRequestError && e.code === code
}

function hasDetail(key: string, value: string) {
  return (e: unknown) => e instanceof ApiRequestError && String(e.details?.[key]) === value
}

/** Breaks the expiry check digit only, so the MRZ check names 'expiry'. */
function withBadExpiryCheck(): string {
  const line = buildSpecimenLine2()
  return line.slice(0, 27) + (line[27] === '0' ? '1' : '0') + line.slice(28)
}

test('start → document → hold → confirm → bags → complete issues a pass with gate A1', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'ER204F', lastName: 'Eriksson' })
  await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
  const lock = await api.holdSeat(c.flight.id, { checkInId: c.id, seatCode: '18B' })
  await api.confirmSeat(c.id, { lockId: lock.id })
  await api.declareBags(c.id, { declaredBags: 1 })
  const p = await api.complete(c.id)
  assert.equal(p.seat, '18B')
  assert.equal(p.gate, 'A1')
  assert.equal(p.boardingGroup, 4)
  assert.match(p.reference, /^[A-HJ-NP-Z2-9]{8}$/)
})

test('errors carry the backend codes', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  await assert.rejects(api.start({ pnr: 'NOPE00', lastName: 'X' }), isCode('NOT_FOUND'))

  const c = await api.start({ pnr: 'ER204F', lastName: 'Eriksson' })
  await assert.rejects(
    api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: withBadExpiryCheck() }),
    (e: unknown) => isCode('MRZ_INVALID')(e) && hasDetail('failedCheck', 'expiry')(e),
  )
  await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
  await assert.rejects(api.holdSeat(c.flight.id, { checkInId: c.id, seatCode: '1A' }), isCode('SEAT_TAKEN'))
})

test('security hold stops the flow with ON_HOLD', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'HD204H', lastName: 'Kowalski' })
  const held = await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
  assert.equal(held.status, 'on_hold')
  await assert.rejects(api.holdSeat(c.flight.id, { checkInId: c.id, seatCode: '18B' }), isCode('ON_HOLD'))
  await assert.rejects(api.declareBags(c.id, { declaredBags: 1 }), isCode('ON_HOLD'))
  await assert.rejects(api.complete(c.id), isCode('ON_HOLD'))
})

test('visa needed on FY 318 for a UTO passport', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'EC318D', lastName: 'Lopez' })
  await assert.rejects(api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() }), isCode('VISA_REQUIRED'))
  const after = await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2(), visaNumber: 'VISA-123' })
  assert.equal(after.document?.visaRequired, true)
  assert.equal(after.document?.visaNumber, 'VISA-123')
})

test('window closed when the clock is past closesAt', async () => {
  const api = createMockApi({ now: new Date('2026-11-11T02:30:00.000Z') })
  await assert.rejects(api.start({ pnr: 'ER204F', lastName: 'Eriksson' }), isCode('WINDOW_CLOSED'))
})

test('complete is idempotent', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'ER204F', lastName: 'Eriksson' })
  await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
  const lock = await api.holdSeat(c.flight.id, { checkInId: c.id, seatCode: '18B' })
  await api.confirmSeat(c.id, { lockId: lock.id })
  await api.declareBags(c.id, { declaredBags: 0 })
  const first = await api.complete(c.id)
  const second = await api.complete(c.id)
  assert.equal(second.id, first.id)
  assert.equal(second.reference, first.reference)
})

test('no seat picked gets any free standard seat, marked as mine on the map', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'ER204F', lastName: 'Eriksson' })
  await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
  const p = await api.complete(c.id)
  const map = await api.seatMap(c.flight.id)
  const mine = map.rows.flatMap((row) => row.seats).filter((seat) => seat.status === 'mine')
  assert.equal(mine.length, 1)
  assert.equal(mine[0].code, p.seat)
})

test('the document and the pass are refused once the window closes', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] })
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'ER204F', lastName: 'Eriksson' })
  await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
  // The FY 204 window closes at 02:25Z and the demo clock starts at 01:00Z.
  t.mock.timers.tick(90 * 60 * 1000)
  await assert.rejects(api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() }), isCode('WINDOW_CLOSED'))
  await assert.rejects(api.complete(c.id), isCode('WINDOW_CLOSED'))
})

test('a check-in that already has a pass refuses a new document and new bags', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'ER204F', lastName: 'Eriksson' })
  await api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() })
  await api.complete(c.id)
  await assert.rejects(api.submitDocument(c.id, { mrzLine1: SPECIMEN_LINE1, mrzLine2: buildSpecimenLine2() }), isCode('INVALID_STATE'))
  await assert.rejects(api.declareBags(c.id, { declaredBags: 1 }), isCode('INVALID_STATE'))
})

test('an unmapped issuing country is stored as zz and flagged', async () => {
  const api = createMockApi({ now: DEMO_NOW })
  const c = await api.start({ pnr: 'ER204F', lastName: 'Eriksson' })
  const view = await api.submitDocument(c.id, {
    mrzLine1: `P<XYZ${SPECIMEN_LINE1.slice(5)}`,
    mrzLine2: buildSpecimenLine2(),
  })
  assert.equal(view.document?.issuingCountry, 'zz')
  assert.ok(view.document?.profileDifferences.includes('issuing_country_unmapped'))
})
