import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { GUEST_REPORT_PATHS, lookUpGuestBooking, submitGuestLostReport, type GuestApiOptions } from './guest-report-api.ts'
import {
  buildGuestLostReportFormData,
  caseAccessActionsFor,
  defaultGuestTravellerId,
  GUEST_CONFIRMATION_NOTE,
  GUEST_SUCCESS_MESSAGE,
  guestFlightKey,
  guestFlightsForSelection,
  parseGuestReportResult,
  reportingModeFor,
  usableGuestFlights,
  usableGuestTravellers,
  validateGuestLostReportForm,
  type LostBagFormValues,
} from './lost-report-form.ts'

const ANNA = '00000000-0000-4000-8000-000000000201'
const ERIK = '00000000-0000-4000-8000-000000000202'
const OUT = { flightNumber: 'FY204', serviceDate: '2026-10-19', origin: 'BKK', destination: 'NRT' }
const BACK = { flightNumber: 'FY205', serviceDate: '2026-10-26', origin: 'NRT', destination: 'BKK' }

const travellersBody = [
  { travellerId: ANNA, displayName: 'Anna Eriksson', flights: [OUT, BACK] },
  { travellerId: ERIK, displayName: 'Erik Eriksson', flights: [OUT] },
]
const travellers = usableGuestTravellers(travellersBody)

const values = (overrides: Partial<LostBagFormValues> = {}): LostBagFormValues => ({
  bookingReference: ' k7qx2m ',
  surname: ' Eriksson ',
  flightId: guestFlightKey(OUT),
  bagType: 'suitcase',
  colour: 'black',
  tagNumber: '',
  brand: '',
  description: '',
  contactEmail: ' anna@example.com ',
  contactPhone: '',
  ...overrides,
})

const pagesDir = import.meta.dirname
const source = (relative: string) => readFileSync(join(pagesDir, relative), 'utf8')

// ---------------------------------------------------------------------------------------------------------------------
// Mode selection

test('reporting mode follows Clerk sign-in state only', () => {
  assert.equal(reportingModeFor({ isLoaded: true, isSignedIn: true }), 'customer')
  assert.equal(reportingModeFor({ isLoaded: true, isSignedIn: false }), 'guest')
  assert.equal(reportingModeFor({ isLoaded: true, isSignedIn: null }), 'guest')
  assert.equal(reportingModeFor({ isLoaded: false, isSignedIn: false }), 'pending')
  assert.equal(reportingModeFor({ isLoaded: false, isSignedIn: true }), 'pending')
})

test('a Clerk-signed-in user stays in customer mode whatever the app session does (no guest fallback)', () => {
  // The mode takes only Clerk's state: an app session exchange failure (AppAuthProvider user === null) cannot reach it.
  assert.equal(reportingModeFor.length, 1)
  assert.equal(reportingModeFor({ isLoaded: true, isSignedIn: true }), 'customer')

  const route = source('../../../routes/report-lost-bag.tsx')
  assert.match(route, /import \{ useAuth \} from '@clerk\/clerk-react'/)
  assert.match(route, /reportingModeFor\(\{ isLoaded, isSignedIn \}\)/)
  assert.doesNotMatch(route, /useAppAuth|\.user\b|accessToken/, 'the route must not infer the mode from the app session')
  // The root header is shared; signed-in reporting still requires its app session provider.
  assert.match(route, /<AppAuthProvider>\s*<PassengerLostBagReportPage \/>\s*<\/AppAuthProvider>/)
  assert.match(route, /if \(mode === 'guest'\) \{\s*return <GuestLostBagReportPage \/>/)
  assert.doesNotMatch(route, /FlythonHeader|GuestReportHeader/)
  assert.match(route, /createFileRoute\('\/report-lost-bag'\)/)
})

test('the guest page never touches the signed-in session; the customer page keeps using it', () => {
  const page = source('PassengerLostBagReportPage.tsx')
  const guestPage = page.slice(page.indexOf('export function GuestLostBagReportPage'), page.indexOf('function LostBagReportForm'))
  const customerPage = page.slice(
    page.indexOf('export function PassengerLostBagReportPage'),
    page.indexOf('export function GuestLostBagReportPage'),
  )
  assert.doesNotMatch(guestPage, /useAppAuth|fetchWithAuth/)
  assert.match(customerPage, /const \{ fetchWithAuth \} = useAppAuth\(\)/)
})

// ---------------------------------------------------------------------------------------------------------------------
// Traveller and flight pairing

test('guest travellers keep their own flights, keyed locally without server ids', () => {
  assert.deepEqual(
    travellers.map((t) => ({ id: t.bookingPassengerId, name: t.displayName, isYou: t.isYou, flights: t.flights.map((f) => f.flightId) })),
    [
      { id: ANNA, name: 'Anna Eriksson', isYou: false, flights: ['guest:FY204:2026-10-19', 'guest:FY205:2026-10-26'] },
      { id: ERIK, name: 'Erik Eriksson', isYou: false, flights: ['guest:FY204:2026-10-19'] },
    ],
  )
  assert.deepEqual(usableGuestFlights([OUT, { flightNumber: 'bad' }, null]), [{ flightId: 'guest:FY204:2026-10-19', ...OUT }])
  // Malformed travellers, and travellers without a usable flight, are dropped.
  assert.equal(usableGuestTravellers([{ travellerId: 1 }, { travellerId: ERIK, displayName: 'E', flights: [{}] }, 'x']).length, 0)
})

test('only the selected traveller’s flights are offered, and none before a traveller is chosen', () => {
  assert.deepEqual(
    guestFlightsForSelection(travellers, ERIK).map((f) => f.flightNumber),
    ['FY204'],
  )
  assert.deepEqual(
    guestFlightsForSelection(travellers, ANNA).map((f) => f.flightNumber),
    ['FY204', 'FY205'],
  )
  assert.deepEqual(guestFlightsForSelection(travellers, ''), [])
  assert.deepEqual(guestFlightsForSelection(travellers, 'someone-else'), [])
})

test('changing traveller keeps a flight both hold and clears one the new traveller does not hold', () => {
  // The page keeps values.flightId only if it is in the newly selected traveller's flights.
  const keepsShared = guestFlightsForSelection(travellers, ERIK).some((f) => f.flightId === guestFlightKey(OUT))
  const keepsAnnaOnly = guestFlightsForSelection(travellers, ERIK).some((f) => f.flightId === guestFlightKey(BACK))
  assert.equal(keepsShared, true)
  assert.equal(keepsAnnaOnly, false)
})

test('a single traveller is chosen automatically; several must be picked', () => {
  assert.equal(defaultGuestTravellerId(travellers.slice(1)), ERIK)
  assert.equal(defaultGuestTravellerId(travellers), '')
  assert.equal(defaultGuestTravellerId([]), '')
})

test('guest validation needs a traveller and one of that traveller’s flights, plus the usual field rules', () => {
  assert.deepEqual(validateGuestLostReportForm(values(), travellers, ANNA), {})
  assert.equal(validateGuestLostReportForm(values(), travellers, '').traveller, 'Choose whose bag it is.')
  assert.equal(
    validateGuestLostReportForm(values({ flightId: guestFlightKey(BACK) }), travellers, ERIK).flightId,
    'Select a flight from the eligible flights.',
  )
  assert.equal(
    validateGuestLostReportForm(values({ contactEmail: '' }), travellers, ANNA).contact,
    'Enter at least one contact method: email or phone.',
  )
  assert.equal(
    validateGuestLostReportForm(values({ tagNumber: '123' }), travellers, ANNA).tagNumber,
    'Enter a 10-digit tag number starting with 0.',
  )
})

// ---------------------------------------------------------------------------------------------------------------------
// Guest request payload

test('the guest form data has exactly the backend DTO field names and never sends server ids', () => {
  const formData = buildGuestLostReportFormData(values({ brand: ' Samsonite ', tagNumber: ' 0789204578 ' }), travellers, ERIK, null)

  assert.deepEqual(
    [...formData.entries()],
    [
      ['bookingReference', 'K7QX2M'],
      ['surname', 'Eriksson'],
      ['travellerId', ERIK],
      ['flightNumber', 'FY204'],
      ['serviceDate', '2026-10-19'],
      ['bagType', 'suitcase'],
      ['colour', 'black'],
      ['tagNumber', '0789204578'],
      ['brand', 'Samsonite'],
      ['contactEmail', 'anna@example.com'],
    ],
  )
  for (const forbidden of ['flightId', 'bookingPassengerId', 'passengerId', 'photo'])
    assert.equal(formData.has(forbidden), false, forbidden)
})

test('an optional photo is attached as "photo" with its original File', () => {
  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bag.jpg', { type: 'image/jpeg' })
  const formData = buildGuestLostReportFormData(values(), travellers, ANNA, photo)
  assert.equal(formData.get('photo'), photo)
})

test('a flight that belongs to another traveller is never put in a guest request', () => {
  assert.throws(() => buildGuestLostReportFormData(values({ flightId: guestFlightKey(BACK) }), travellers, ERIK, null))
  assert.throws(() => buildGuestLostReportFormData(values(), travellers, '', null))
})

// ---------------------------------------------------------------------------------------------------------------------
// Guest API client

type Call = { url: string; init: RequestInit }
function stubFetch(...responses: Array<Response | Error>) {
  const calls: Call[] = []
  const options: GuestApiOptions = {
    baseUrl: 'https://api.test',
    fetchImpl: (url, init) => {
      calls.push({ url, init })
      const next = responses.shift()
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? new Response(null, { status: 500 }))
    },
  }
  return { calls, options }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const verificationFailed = () => json({ code: 'INVALID_REPORT', message: 'Booking verification failed' }, 400)

test('booking lookup posts the reference and surname as JSON to both public guest endpoints, with no session', async () => {
  const { calls, options } = stubFetch(json([OUT, BACK]), json(travellersBody))

  const result = await lookUpGuestBooking({ bookingReference: 'K7QX2M', surname: 'Eriksson' }, options)

  assert.equal(result.ok, true)
  assert.deepEqual(
    calls.map((c) => c.url),
    [`https://api.test${GUEST_REPORT_PATHS.flights}`, `https://api.test${GUEST_REPORT_PATHS.travellers}`],
  )
  assert.equal(GUEST_REPORT_PATHS.flights, '/api/guest/lost-report-flights')
  assert.equal(GUEST_REPORT_PATHS.travellers, '/api/guest/lost-report-travellers')
  for (const { url, init } of calls) {
    assert.equal(init.method, 'POST')
    assert.equal(init.credentials, 'omit')
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' })
    assert.equal(init.body, JSON.stringify({ bookingReference: 'K7QX2M', surname: 'Eriksson' }))
    assert.doesNotMatch(url, /\?|K7QX2M|Eriksson/, 'booking details must not be in the URL')
  }
  if (result.ok) {
    assert.deepEqual(
      result.travellers.map((t) => t.bookingPassengerId),
      [ANNA, ERIK],
    )
    assert.deepEqual(
      result.flights.map((f) => f.flightId),
      ['guest:FY204:2026-10-19', 'guest:FY205:2026-10-26'],
    )
  }
})

test('report submission posts multipart to the public endpoint with no Authorization, no cookies and a runtime boundary', async () => {
  const photo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'bag.png', { type: 'image/png' })
  const formData = buildGuestLostReportFormData(values(), travellers, ANNA, photo)
  const { calls, options } = stubFetch(
    json(
      {
        caseNumber: 'LB-2026-000121',
        status: 'open',
        flightNumber: 'FY204',
        serviceDate: '2026-10-19',
        bagType: 'suitcase',
        colour: 'black',
        tagNumber: null,
      },
      201,
    ),
  )

  const outcome = await submitGuestLostReport(formData, options)

  assert.deepEqual(outcome, {
    ok: true,
    result: {
      caseNumber: 'LB-2026-000121',
      status: 'open',
      flightNumber: 'FY204',
      serviceDate: '2026-10-19',
      bagType: 'suitcase',
      colour: 'black',
      tagNumber: null,
    },
  })
  const [{ url, init }] = calls
  assert.equal(url, 'https://api.test/api/guest/lost-reports')
  assert.equal(init.method, 'POST')
  assert.equal(init.credentials, 'omit')
  assert.equal(init.headers, undefined, 'no Authorization and no hand-set Content-Type')
  assert.equal(init.body, formData)

  // What the browser would send: multipart with a generated boundary, and every field plus the file intact.
  const request = new Request(url, init)
  assert.match(request.headers.get('content-type') ?? '', /^multipart\/form-data; boundary=.+/)
  assert.equal(request.headers.get('authorization'), null)
  const sent = await request.formData()
  assert.equal(sent.get('travellerId'), ANNA)
  assert.equal(sent.get('flightNumber'), 'FY204')
  assert.equal(sent.get('serviceDate'), '2026-10-19')
  assert.equal((sent.get('photo') as File).name, 'bag.png')
})

test('a report without a photo is still multipart and carries no photo field', async () => {
  const formData = buildGuestLostReportFormData(values(), travellers, ANNA, null)
  const { calls, options } = stubFetch(
    json(
      {
        caseNumber: 'LB-2026-000122',
        status: 'open',
        flightNumber: 'FY204',
        serviceDate: '2026-10-19',
        bagType: 'suitcase',
        colour: 'black',
        tagNumber: null,
      },
      201,
    ),
  )

  await submitGuestLostReport(formData, options)

  const sent = await new Request(calls[0].url, calls[0].init).formData()
  assert.equal(sent.has('photo'), false)
})

test('lookup errors: failed verification, an unavailable travellers list, no eligible data and network errors', async () => {
  const access = { bookingReference: 'K7QX2M', surname: 'Smith' }
  const notFound = 'We could not find an eligible booking with that booking reference and surname.'

  assert.deepEqual(await lookUpGuestBooking(access, stubFetch(verificationFailed(), verificationFailed()).options), {
    ok: false,
    message: notFound,
  })
  assert.deepEqual(await lookUpGuestBooking(access, stubFetch(json([OUT]), verificationFailed()).options), { ok: false, message: notFound })
  assert.deepEqual(await lookUpGuestBooking(access, stubFetch(json([]), json([])).options), { ok: false, message: notFound })
  assert.deepEqual(await lookUpGuestBooking(access, stubFetch(new TypeError('Failed to fetch'), json([])).options), {
    ok: false,
    message: 'We could not reach the server. Check your connection and try again.',
  })
  assert.deepEqual(await lookUpGuestBooking(access, stubFetch(new Response('oops', { status: 500 }), json([])).options), {
    ok: false,
    message: 'Eligible flights could not be loaded. Try again.',
  })
})

test('submission errors: verification, validation arrays, duplicates, storage, network and an incomplete confirmation', async () => {
  const formData = () => buildGuestLostReportFormData(values(), travellers, ANNA, null)
  const submit = async (response: Response | Error) => submitGuestLostReport(formData(), stubFetch(response).options)

  assert.deepEqual(await submit(verificationFailed()), {
    ok: false,
    message: 'We could not verify the booking, traveller and flight. Find your booking again, then retry.',
  })
  assert.deepEqual(await submit(json({ message: ['property flightId should not exist'], error: 'Bad Request', statusCode: 400 }, 400)), {
    ok: false,
    message: 'property flightId should not exist',
  })
  assert.deepEqual(await submit(json({ code: 'REPORT_EXISTS', message: 'A live report already exists for this baggage tag' }, 409)), {
    ok: false,
    message: 'A live report already exists for this baggage tag',
  })
  assert.deepEqual(await submit(json({ code: 'PHOTO_STORAGE_UNAVAILABLE', message: 'Photo storage is unavailable' }, 503)), {
    ok: false,
    message: 'Photo storage is unavailable',
  })
  assert.deepEqual(await submit(new TypeError('Failed to fetch')), {
    ok: false,
    message: 'We could not reach the server. Check your connection and try again.',
  })
  const incomplete = await submit(json({ caseNumber: 'LB-2026-000123' }, 201))
  assert.equal(incomplete.ok, false)
})

// ---------------------------------------------------------------------------------------------------------------------
// Confirmation and navigation

test('the guest confirmation reads only the minimal result and promises no email', () => {
  assert.deepEqual(
    parseGuestReportResult({
      caseNumber: 'LB-2026-000121',
      status: 'open',
      flightNumber: 'FY204',
      serviceDate: '2026-10-19',
      bagType: 'backpack',
      colour: 'red',
      tagNumber: '0789204578',
      extra: 'x',
    }),
    {
      caseNumber: 'LB-2026-000121',
      status: 'open',
      flightNumber: 'FY204',
      serviceDate: '2026-10-19',
      bagType: 'backpack',
      colour: 'red',
      tagNumber: '0789204578',
    },
  )
  assert.equal(parseGuestReportResult({ caseNumber: '', status: 'open' }), null)
  assert.equal(
    parseGuestReportResult({
      caseNumber: 'LB-1',
      status: 'open',
      flightNumber: 'FY1',
      serviceDate: 'x',
      bagType: 'crate',
      colour: 'red',
      tagNumber: null,
    }),
    null,
  )
  assert.doesNotMatch(GUEST_CONFIRMATION_NOTE, /email|emailed|sent you/i)
})

test('the "Already reported?" area sends guests to public tracking and customers to My bag case', () => {
  assert.deepEqual(caseAccessActionsFor('guest'), { openCreatedCase: false, checkMyCase: false, guestCaseTracking: true })
  assert.deepEqual(caseAccessActionsFor('customer'), { openCreatedCase: true, checkMyCase: true, guestCaseTracking: false })

  const page = source('PassengerLostBagReportPage.tsx')
  const sidebar = page.slice(page.indexOf('<aside className="passenger-report-sidebar">'), page.indexOf('</aside>'))
  assert.match(page, /\{caseAccess\.openCreatedCase && \(/)
  // The shared area is visible in both modes; only the destination changes.
  assert.match(sidebar, /<h2>Already reported\?<\/h2>/)
  assert.match(
    sidebar.replace(/[\s()]/g, ''),
    /\{caseAccess\.checkMyCase\?<Linkto="\/lost-bag-case">Checkmycase<\/Link>:<Linkto="\/track-lost-bag">Checkmycase<\/Link>\}/,
  )
  // The guest confirmation's "Check my case" also goes to public tracking with the case number only.
  assert.match(
    page,
    /\{caseAccess\.guestCaseTracking && \([\s\S]*?navigate\(\{ to: '\/track-lost-bag', search: \{ case: pageState\.caseNumber \} \}\)[\s\S]*?Check my case/,
  )
  // My bag case stays behind the authenticated layout; tracking stays public.
  assert.match(source('../../../routes/_authenticated/lost-bag-case.tsx'), /createFileRoute\('\/_authenticated\/lost-bag-case'\)/)
  assert.match(source('../../../routes/track-lost-bag.tsx'), /createFileRoute\('\/track-lost-bag'\)/)
})

test('guest follow-up copy promises no online tracking, delivery choice or email; customer copy is unchanged', () => {
  const page = source('PassengerLostBagReportPage.tsx')
  const customerCopy = [
    'Tell us about the bag. Staff at every airport search for it, and you can follow the case online.',
    'Once staff confirm it is your bag, you choose home, hotel, another address or airport pickup.',
  ]
  const guestCopy = [
    'Tell us about the bag. Staff at every airport search for it. Keep your case number and contact airline staff for updates.',
    'If staff find your bag, contact airline staff with your case number for updates and to arrange its collection.',
  ]
  for (const text of customerCopy) assert.ok(page.includes(text), `customer copy kept: ${text}`)
  for (const text of guestCopy) {
    assert.ok(page.includes(text), `guest copy present: ${text}`)
    assert.doesNotMatch(text, /online|track|email|choose|home, hotel|airport pickup/i)
  }
  // Each pair is chosen by mode, and both "What happens next" panels receive the mode.
  assert.equal(page.match(/<WhatHappensNext isGuest=\{isGuest\} \/>/g)?.length, 2)
  assert.doesNotMatch(page, /<WhatHappensNext \/>/)
})

test('baggage routes use the root header and case tracking keeps authentication without profile gating', () => {
  const root = source('../../../routes/__root.tsx')
  const layout = source('../../../routes/_authenticated.tsx')
  assert.match(root, /<SiteHeader \/>\s*<Outlet \/>/)
  assert.doesNotMatch(layout, /FlythonHeader|GuestReportHeader/)
  assert.match(layout, /!context\.auth\.isSignedIn/)
  assert.match(layout, /location\.pathname\.replace\(/)
  assert.match(layout, /=== '\/lost-bag-case'/)
  assert.match(layout, /<AppAuthProvider>\s*\{isBaggageCase \? \(\s*<Outlet \/>/)
  assert.match(layout, /<AccountProvider>\s*<Outlet \/>\s*<\/AccountProvider>/)
})

test('guests see the green "sent" banner without an email claim; customers keep the original label', () => {
  assert.equal(GUEST_SUCCESS_MESSAGE, 'Report sent successfully.')
  assert.doesNotMatch(GUEST_SUCCESS_MESSAGE, /email|emailed|inbox|sent you/i)

  const page = source('PassengerLostBagReportPage.tsx')
  assert.match(
    page,
    /\{isGuest \? \(\s*<div className="passenger-report-success__banner" role="status">\s*\{GUEST_SUCCESS_MESSAGE\}\s*<\/div>\s*\) : \(\s*<p className="passenger-report-success__eyebrow">Report sent<\/p>\s*\)\}/,
  )
  assert.match(
    source('PassengerLostBagReportPage.css'),
    /\.passenger-report-success__banner \{[^}]*background: #e7f5ec;[^}]*color: #157443;/,
  )
})
