// Staff API mock tests.
// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMockStaffApi } from './mock-staff-api.ts'

const FY204 = 'flt-fy204'
const FY318 = 'flt-fy318'
const A1 = 'gate-a1'
const A2 = 'gate-a2'
const BAG = { lengthCm: 50, widthCm: 30, heightCm: 20 }

test('gate list at A1 shows police first, 4 groups, nobody boarded', async () => {
  const api = createMockStaffApi()
  const list = await api.passengerList(A1, FY204)

  assert.equal(list.gate.code, 'A1')
  assert.equal(list.flight.flightNumber, 'FY 204')
  assert.equal(list.closedAt, null)
  assert.equal(list.boardedCount, 0)
  assert.deepEqual(
    list.police.map((e) => e.passengerName),
    ['Narong Sukjai'],
  )
  assert.deepEqual(
    list.groups['1'].map((e) => e.passengerName),
    ['Somchai Prasert'],
  )
  assert.deepEqual(
    list.groups['2'].map((e) => e.passengerName),
    ['Kenji Watanabe', 'Lina Haddad'],
  )
  assert.deepEqual(
    list.groups['3'].map((e) => e.passengerName),
    ['Mai Tran'],
  )
  assert.deepEqual(
    list.groups['4'].map((e) => e.passengerName),
    ['Anna Eriksson', 'Pim Saetang', 'Dana Kowalski', 'Tom Becker'],
  )
  assert.equal(list.groups['4'].find((e) => e.passengerName === 'Dana Kowalski')?.status, 'on_hold')
})

test('scan outcomes: boarded, already boarded, wrong gate with correct gate A2, not found, on hold', async () => {
  const api = createMockStaffApi()

  const boarded = await api.scan(A1, { flightId: FY204, reference: 'v3lp9kwe' })
  assert.equal(boarded.event, 'boarded')
  assert.equal(boarded.reason, null)
  assert.equal(boarded.passenger?.name, 'Narong Sukjai')
  assert.equal(boarded.passenger?.seat, '20C')
  assert.equal(boarded.message, 'Boarded: Narong Sukjai, seat 20C.')

  const again = await api.scan(A1, { flightId: FY204, reference: 'V3LP9KWE' })
  assert.equal(again.event, 'rejected')
  assert.equal(again.reason, 'ALREADY_BOARDED')

  const wrongGate = await api.scan(A1, { flightId: FY204, reference: 'T8GR5YKM' })
  assert.equal(wrongGate.event, 'rejected')
  assert.equal(wrongGate.reason, 'WRONG_GATE')
  assert.equal(wrongGate.correctGate, 'A2')

  const missing = await api.scan(A1, { flightId: FY204, reference: 'ZZZZZZZZ' })
  assert.equal(missing.reason, 'NOT_FOUND')

  const held = await api.scan(A1, { flightId: FY204, reference: 'H3VN8PLA' })
  assert.equal(held.reason, 'ON_HOLD')
})

test('close gate: needs a count, mismatch then confirm, freezes count and marks no-shows', async () => {
  const api = createMockStaffApi()
  const [tom] = await api.search({ pnr: 'EC204J' })
  await api.weighBag(tom.id, { weightKg: 12, ...BAG })

  await api.scan(A1, { flightId: FY204, reference: 'V3LP9KWE' })
  await api.scan(A1, { flightId: FY204, reference: 'R8KD2WQN' })
  await api.scan(A1, { flightId: FY204, reference: 'M4XT7BZC' })

  await assert.rejects(() => api.closeGate(FY204, {}), { code: 'VALIDATION' })

  const counted = await api.setHeadcount(FY204, { source: 'sensor' })
  assert.equal(counted.sensorCount, 2)
  assert.equal(counted.boardedCount, 3)

  await assert.rejects(() => api.closeGate(FY204, {}), { code: 'HEADCOUNT_MISMATCH' })

  const closed = await api.closeGate(FY204, { confirmMismatch: true })
  assert.notEqual(closed.closedAt, null)
  assert.equal(closed.boardedCount, 3)

  const list = await api.passengerList(A1, FY204)
  assert.equal(list.boardedCount, 3)
  const tomEntry = list.groups['4'].find((e) => e.passengerName === 'Tom Becker')
  assert.equal(tomEntry?.status, 'no_show')
  const view = await api.detail(tom.id)
  assert.equal(view.bags[0].status, 'offloaded')

  const late = await api.scan(A1, { flightId: FY204, reference: 'Z5HB8RTU' })
  assert.equal(late.reason, 'GATE_CLOSED')
})

test('gate swap moves FY 204 to A2 and the list at A2 shows it', async () => {
  const api = createMockStaffApi()
  const moved = await api.setGate(FY204, { gateId: A2 })
  assert.equal(moved.gate?.code, 'A2')
  await api.setGate(FY318, { gateId: A1 })

  const atA2 = await api.passengerList(A2, FY204)
  assert.equal(atA2.gate.code, 'A2')
  assert.equal(atA2.flight.flightNumber, 'FY 204')
  assert.equal(atA2.groups['4'].length, 4)

  const atA1 = await api.passengerList(A1, FY318)
  assert.equal(atA1.flight.flightNumber, 'FY 318')
})

test('bag drop: 15, 8, 10 → excess 0, 3, 10; tag blocked until paid; pay-and-tag numbers 0402000001', async () => {
  const api = createMockStaffApi()
  const [anna] = await api.search({ pnr: 'ER204F' })

  await api.weighBag(anna.id, { weightKg: 15, ...BAG })
  const second = await api.weighBag(anna.id, { weightKg: 8, ...BAG })
  assert.deepEqual(
    second.bags.map((b) => b.excessKg),
    [0, 3],
  )
  const third = await api.weighBag(anna.id, { weightKg: 10, ...BAG })
  assert.deepEqual(
    third.bags.map((b) => b.excessKg),
    [0, 3, 10],
  )
  assert.deepEqual(
    third.bags.map((b) => b.excessFee),
    [0, 1500, 5000],
  )
  assert.equal(third.totals.unpaidFee, 6500)

  // the tag waits for the fee: no tag number and no payment while the excess is unpaid
  assert.equal(third.bags[1].tagNumber, null)
  assert.equal(third.bags[1].status, 'weighed')
  assert.equal(third.bags[1].excessPaymentId, null)
  assert.ok(third.issues.includes('EXCESS_UNPAID'))

  const tagged = await api.tagBag(third.bags[1].id)
  assert.equal(tagged.bag.tagNumber, '0402000001')
  assert.equal(tagged.bag.status, 'tagged')
  // the bags of one passenger are paid together and share one payment
  assert.equal(tagged.bag.excessPaymentId, tagged.view.bags[2].excessPaymentId)
  assert.equal(tagged.view.totals.unpaidFee, 0)
})

test('issue list shows EXCESS_UNPAID and clears after tagging', async () => {
  const api = createMockStaffApi()
  const [anna] = await api.search({ pnr: 'ER204F' })

  const weighed = await api.weighBag(anna.id, { weightKg: 25, ...BAG })
  assert.deepEqual(weighed.issues, ['EXCESS_UNPAID'])
  assert.equal(weighed.totals.unpaidFee, 2500)

  const tagged = await api.tagBag(weighed.bags[0].id)
  assert.deepEqual(tagged.view.issues, [])
  assert.equal(tagged.view.totals.unpaidFee, 0)
})

test('counter actions: remove a bag, check the carry-on, print the pass', async () => {
  const api = createMockStaffApi()
  const [anna] = await api.search({ pnr: 'ER204F' })

  const weighed = await api.weighBag(anna.id, { weightKg: 25, ...BAG })
  const removed = await api.removeBag(weighed.bags[0].id)
  assert.deepEqual(removed.bags, [])
  assert.equal(removed.totals.unpaidFee, 0)

  const tagged = await api.tagBag((await api.weighBag(anna.id, { weightKg: 25, ...BAG })).bags[0].id)
  await assert.rejects(() => api.removeBag(tagged.bag.id), { code: 'INVALID_STATE' })

  const carryOn = await api.carryOn(anna.id, { weightKg: 8, lengthCm: 56, widthCm: 36, heightCm: 23 })
  assert.equal(carryOn.carryOnCheck?.result, 'must_check')
  const within = await api.carryOn(anna.id, { weightKg: 5, lengthCm: 50, widthCm: 30, heightCm: 20 })
  assert.equal(within.carryOnCheck?.result, 'ok')

  const passId = within.boardingPass?.id
  assert.ok(passId)
  const printed = await api.printPass(passId)
  assert.notEqual(printed.printedAt, null)
})

test('issue list flags a security hold and a visa check, staff clear the visa', async () => {
  const api = createMockStaffApi()
  const [dana] = await api.search({ pnr: 'HD204H' })
  const [arun] = await api.search({ pnr: 'BZ318B' })

  const danaView = await api.detail(dana.id)
  assert.ok(danaView.issues.includes('ON_HOLD'))

  const arunView = await api.detail(arun.id)
  assert.ok(arunView.issues.includes('VISA_CHECK'))
  const documentId = arunView.checkIn.document?.id
  assert.ok(documentId)
  const cleared = await api.checkVisa(documentId)
  assert.ok(!cleared.issues.includes('VISA_CHECK'))
})
