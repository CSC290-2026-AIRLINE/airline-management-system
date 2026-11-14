import assert from 'node:assert/strict'
import test from 'node:test'
import { quoteSeatChoices } from './useSeatQuote.ts'

const itinerary = { selections: [{ flight: { flightId: 'out' }, fare: { fareClassId: 'fare', currency: 'THB' } }] }
const travellers = [
  { key: 'adult', expectedType: 'adult' },
  { key: 'child', expectedType: 'child' },
  { key: 'baby', expectedType: 'infant' },
]
const maps = {
  out: {
    rows: [
      {
        row: 8,
        seats: [
          { seatCode: '8A', type: 'extra_legroom' },
          { seatCode: '8B', type: 'standard' },
          { seatCode: '8C', type: 'extra_legroom' },
        ],
      },
    ],
  },
}

test('uses complete pricing quotes including seats, promo and taxes, while excluding lap infants', async () => {
  const requests = []
  const fetcher = async (path, init) => {
    const body = JSON.parse(init.body)
    requests.push({ path, body })
    return Response.json({ currency: 'THB', total_amount: body.seat_type === 'extra_legroom' ? '175.25' : '148.50' })
  }
  const total = await quoteSeatChoices(
    fetcher,
    itinerary,
    travellers,
    [{ travellerKey: 'adult', flightId: 'out', seatCode: '8A' }],
    maps,
    'PROMO',
  )
  assert.equal(total, 323.75)
  assert.equal(requests.length, 2)
  assert.ok(requests.every(({ path, body }) => path === '/api/fare-quotes' && body.promo_code === 'PROMO'))
  assert.equal(requests[0].body.seat_type, 'extra_legroom')
  assert.equal(requests[1].body.seat_type, undefined)
})

test('reuses a quote for passengers choosing the same seat type and rounds each passenger in cents', async () => {
  let calls = 0
  const total = await quoteSeatChoices(
    async () => {
      calls += 1
      return Response.json({ currency: 'THB', total_amount: '175.255' })
    },
    itinerary,
    travellers,
    [
      { travellerKey: 'adult', flightId: 'out', seatCode: '8A' },
      { travellerKey: 'child', flightId: 'out', seatCode: '8C' },
    ],
    maps,
  )
  assert.equal(calls, 1)
  assert.equal(total, 350.52)
})

test('skipping seats obtains a fresh fare-only total', async () => {
  const total = await quoteSeatChoices(
    async (_path, init) => {
      assert.equal(JSON.parse(init.body).seat_type, undefined)
      return Response.json({ currency: 'THB', total_amount: '100' })
    },
    itinerary,
    travellers,
    [],
    null,
  )
  assert.equal(total, 200)
})

test('does not accept missing maps, failed pricing, malformed totals or another currency', async () => {
  await assert.rejects(
    quoteSeatChoices(
      async () => assert.fail('must not request pricing'),
      itinerary,
      travellers,
      [{ travellerKey: 'adult', flightId: 'out', seatCode: '99Z' }],
      maps,
    ),
    /Refresh the seat map/,
  )
  await assert.rejects(
    quoteSeatChoices(async () => new Response(null, { status: 422 }), itinerary, travellers, [], maps),
    /could not update/,
  )
  for (const result of [
    { currency: 'USD', total_amount: '100' },
    { currency: 'THB', total_amount: null },
    { currency: 'THB', total_amount: '-1' },
  ]) {
    await assert.rejects(
      quoteSeatChoices(async () => Response.json(result), itinerary, travellers, [], maps),
      /unavailable total/,
    )
  }
})
