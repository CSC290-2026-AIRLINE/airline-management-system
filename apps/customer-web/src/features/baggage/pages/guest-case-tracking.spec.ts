import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { GUEST_REPORT_PATHS, lookUpGuestCase, type GuestApiOptions } from './guest-report-api.ts'
import {
  GUEST_CASE_TRACKING_PATH,
  guestDeliveryNote,
  guestDeliveryStatusLabel,
  guestTimelineLabel,
  parseGuestCaseSummary,
  prefilledCaseNumber,
  validateGuestCaseLookup,
} from './guest-case-tracking.ts'

const source = (relative: string) => readFileSync(join(import.meta.dirname, relative), 'utf8')

const LOOKUP = { caseNumber: ' lb-2026-000121 ', bookingReference: ' k7qx2m ', surname: ' Eriksson ' }

const serverBody = {
  caseNumber: 'LB-2026-000121',
  status: 'delivering',
  reportedAt: '2026-10-19T08:00:00.000Z',
  lostAt: null,
  closedAt: null,
  flight: { flightNumber: 'FY204', serviceDate: '2026-10-19T00:00:00.000Z', origin: 'BKK', destination: 'NRT' },
  bag: { type: 'suitcase', colour: 'black' },
  delivery: { status: 'in_transit' },
  timeline: [
    { type: 'report_received', occurredAt: '2026-10-19T08:00:00.000Z' },
    { type: 'bag_sent', occurredAt: '2026-10-20T11:00:00.000Z' },
  ],
}

type Call = { url: string; init: RequestInit }
function stubFetch(response: Response | Error) {
  const calls: Call[] = []
  const options: GuestApiOptions = {
    baseUrl: 'https://api.test',
    fetchImpl: (url, init) => {
      calls.push({ url, init })
      return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
    },
  }
  return { calls, options }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ---------------------------------------------------------------------------------------------------------------------
// Validation and URL prefill

test('the lookup needs a case number, a six-character booking reference and a surname', () => {
  assert.deepEqual(validateGuestCaseLookup(LOOKUP), {})
  assert.deepEqual(Object.keys(validateGuestCaseLookup({ caseNumber: 'LB-26-1', bookingReference: 'K7-X', surname: ' ' })).sort(), [
    'bookingReference',
    'caseNumber',
    'surname',
  ])
  assert.equal(validateGuestCaseLookup({ ...LOOKUP, surname: 'x'.repeat(101) }).surname, 'Surname must be 100 characters or fewer.')
})

test('only a well-formed case number can prefill the form from the URL', () => {
  assert.equal(prefilledCaseNumber(' lb-2026-000121 '), 'LB-2026-000121')
  for (const junk of ['K7QX2M', 'Eriksson', 'LB-2026-1', '', undefined, 121, ['LB-2026-000121']]) {
    assert.equal(prefilledCaseNumber(junk), '', String(junk))
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// Response allowlist

test('the guest view keeps only allowlisted fields and timeline steps', () => {
  const leaky = {
    ...serverBody,
    id: '00000000-0000-4000-8000-000000000501',
    passenger: { firstName: 'Anna', lastName: 'Eriksson' },
    contactEmail: 'anna@example.com',
    photoUrl: '/api/customer/lost-reports/LB-2026-000121/photo',
    bag: { type: 'suitcase', colour: 'black', brand: 'Samsonite', tagNumber: '0789204578', description: 'Laptop inside' },
    delivery: { status: 'in_transit', address: 'Hotel Gracery', deliveryType: 'hotel', pickupAirport: null },
    timeline: [...serverBody.timeline, { type: 'choice_saved', occurredAt: '2026-10-20T10:00:00.000Z', deliveryType: 'hotel' }],
  }

  const parsed = parseGuestCaseSummary(leaky)

  assert.deepEqual(parsed, serverBody)
  const serialized = JSON.stringify(parsed)
  for (const secret of [
    'Anna',
    'anna@example.com',
    'photo',
    'Samsonite',
    '0789204578',
    'Laptop',
    'Hotel',
    'hotel',
    'choice_saved',
    '0501',
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret))
  }
})

test('a malformed guest view is rejected', () => {
  assert.equal(parseGuestCaseSummary(null), null)
  assert.equal(parseGuestCaseSummary({ ...serverBody, flight: null }), null)
  assert.equal(parseGuestCaseSummary({ ...serverBody, delivery: { status: 'teleported' } }), null)
  assert.equal(parseGuestCaseSummary({ ...serverBody, timeline: 'nope' }), null)
})

test('labels and the delivery note never offer guests an online delivery choice', () => {
  assert.equal(guestTimelineLabel('bag_sent'), 'Bag sent on its way')
  assert.equal(guestDeliveryStatusLabel('waiting_choice'), 'Waiting for arrangements')
  const notes = [
    guestDeliveryNote({ status: 'open', delivery: null }),
    guestDeliveryNote({ status: 'matched', delivery: { status: 'waiting_choice' } }),
    guestDeliveryNote({ status: 'closed', delivery: { status: 'delivered' } }),
    guestDeliveryNote({ status: 'cancelled', delivery: null }),
  ]
  for (const note of notes) assert.doesNotMatch(note, /choose|select|email|home, hotel/i)
})

// ---------------------------------------------------------------------------------------------------------------------
// API client

test('the case lookup posts normalized details as JSON to the public endpoint, with no session or URL details', async () => {
  const { calls, options } = stubFetch(json(serverBody))

  const result = await lookUpGuestCase(LOOKUP, options)

  assert.deepEqual(result, { ok: true, summary: serverBody })
  const [{ url, init }] = calls
  assert.equal(GUEST_REPORT_PATHS.caseLookup, '/api/guest/lost-report-case-lookup')
  assert.equal(url, 'https://api.test/api/guest/lost-report-case-lookup')
  assert.equal(init.method, 'POST')
  assert.equal(init.credentials, 'omit')
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json' })
  assert.equal(init.body, JSON.stringify({ caseNumber: 'LB-2026-000121', bookingReference: 'K7QX2M', surname: 'Eriksson' }))
  assert.doesNotMatch(url, /\?|K7QX2M|Eriksson|LB-2026/)
})

test('every failed verification gets the same message; other failures are generic', async () => {
  const notFound = 'We could not find a case with that case number, booking reference and surname. Check the details and try again.'
  const verificationFailed = () => json({ code: 'INVALID_REPORT', message: 'Booking verification failed' }, 400)

  assert.deepEqual(await lookUpGuestCase(LOOKUP, stubFetch(verificationFailed()).options), { ok: false, message: notFound })
  assert.deepEqual(await lookUpGuestCase({ ...LOOKUP, surname: 'Lind' }, stubFetch(verificationFailed()).options), {
    ok: false,
    message: notFound,
  })
  assert.deepEqual(await lookUpGuestCase(LOOKUP, stubFetch(new Response('oops', { status: 500 })).options), {
    ok: false,
    message: 'Your case could not be opened right now. Try again.',
  })
  assert.deepEqual(await lookUpGuestCase(LOOKUP, stubFetch(new TypeError('Failed to fetch')).options), {
    ok: false,
    message: 'We could not reach the server. Check your connection and try again.',
  })
  assert.equal((await lookUpGuestCase(LOOKUP, stubFetch(json({ caseNumber: 'LB-2026-000121' })).options)).ok, false)
})

// ---------------------------------------------------------------------------------------------------------------------
// Routes and page (source contracts: customer-web has no component-test framework)

test('guest tracking is a public route; signed-in users go to the protected My bag case', () => {
  const route = source('../../../routes/track-lost-bag.tsx')
  assert.equal(GUEST_CASE_TRACKING_PATH, '/track-lost-bag')
  assert.match(route, /createFileRoute\('\/track-lost-bag'\)/)
  assert.match(route, /throw redirect\(\{ to: '\/lost-bag-case' \}\)/)
  assert.match(route, /if \(isSignedIn\) return <Navigate to="\/lost-bag-case" \/>/)
  assert.match(route, /<GuestReportHeader \/>\s*<GuestLostBagCasePage initialCaseNumber=\{caseNumber \?\? ''\} \/>/)
  // Only the case number is accepted from the URL.
  assert.match(route, /const caseNumber = prefilledCaseNumber\(search\.case\)/)
  assert.doesNotMatch(route, /search\.(bookingReference|surname)/)
  // The signed-in page keeps its authenticated route.
  assert.match(source('../../../routes/_authenticated/lost-bag-case.tsx'), /createFileRoute\('\/_authenticated\/lost-bag-case'\)/)
})

test('the guest page has loading, validation, failure, empty and success states, and no session, storage or actions', () => {
  const page = source('GuestLostBagCasePage.tsx')
  assert.doesNotMatch(page, /useAppAuth|fetchWithAuth|localStorage|sessionStorage|useNavigate|navigate\(/)
  // No owner actions: delivery choice, self-found cancellation, or the cancel/photo endpoints.
  assert.doesNotMatch(page, /I found it myself|Yes, cancel report|DeliveryChoiceForm|Save choice|\/cancel|\/photo|<img/)
  assert.match(page, /Loading case details…/) // loading
  assert.match(page, /Object\.values\(fieldErrors\)/) // validation
  assert.match(page, /\{error && \(/) // failure
  assert.match(page, /No case open yet/) // empty
  assert.match(page, /\{summary && \(/) // success
  assert.match(page, /lookUpGuestCase\(input, guestApi\)/)
})

test('a case opened earlier is cleared when the next submission fails client-side validation', () => {
  // Regression: validation used to return before the previous case was cleared, leaving it on screen.
  const page = source('GuestLostBagCasePage.tsx')
  const start = page.indexOf('async function handleLookup')
  const handler = page.slice(start, page.indexOf('\n  }\n', start))
  const clearSummary = handler.indexOf('setSummary(null)')
  const validate = handler.indexOf('validateGuestCaseLookup(input)')
  const validationReturn = handler.indexOf('if (Object.keys(errors).length > 0) return')

  assert.ok(start >= 0 && clearSummary >= 0 && validate >= 0 && validationReturn >= 0, 'handleLookup structure found')
  assert.ok(clearSummary < validate, 'the previous case is cleared before validation runs')
  assert.ok(clearSummary < validationReturn, 'the previous case is cleared before the validation early return')
  // No other early return comes before the clear.
  assert.equal(handler.slice(0, clearSummary).includes('return'), false)
  // The success path still shows the newly opened case.
  assert.match(handler, /setSummary\(result\.summary\)/)
})
