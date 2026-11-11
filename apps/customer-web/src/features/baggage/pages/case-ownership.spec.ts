import assert from 'node:assert/strict'
import test from 'node:test'
import { canUseOwnerActions, resolveViewerOwnership, viewerOwnsBag, type OwnershipResponse } from './case-ownership.ts'

const travellers = [
  { bookingPassengerId: 'bp-anna', displayName: 'Anna Eriksson', isYou: true, flights: [] },
  { bookingPassengerId: 'bp-erik', displayName: 'Erik Eriksson', isYou: false, flights: [] },
]

test('the viewer owns the bag when the case belongs to their own booking passenger', () => {
  assert.equal(viewerOwnsBag('bp-anna', travellers), true)
})

test('another traveller on the booking is not the owner', () => {
  assert.equal(viewerOwnsBag('bp-erik', travellers), false)
})

test('ownership is unknown when either side is missing or malformed', () => {
  assert.equal(viewerOwnsBag(undefined, travellers), null)
  assert.equal(viewerOwnsBag('bp-anna', null), null)
  assert.equal(viewerOwnsBag('bp-anna', { message: 'Booking verification failed' }), null)
  assert.equal(viewerOwnsBag('bp-anna', [{ bookingPassengerId: 'bp-erik', isYou: false }]), null)
  assert.equal(viewerOwnsBag('bp-anna', [{ isYou: true }]), null)
})

test('owner-only controls are allowed only for confirmed ownership (true); false and null are denied', () => {
  assert.equal(canUseOwnerActions(true), true)
  assert.equal(canUseOwnerActions(false), false)
  assert.equal(canUseOwnerActions(null), false)
})

test('loading: ownership starts unknown, so owner-only controls are denied until the lookup resolves', () => {
  const initialOwnership: boolean | null = null
  assert.equal(canUseOwnerActions(initialOwnership), false)
})

test('error states never unlock owner-only controls', () => {
  // A failed traveller request (non-OK body), a missing report owner, or a list without the viewer all stay denied.
  for (const ownership of [
    viewerOwnsBag('bp-anna', { message: 'Booking verification failed' }),
    viewerOwnsBag(undefined, travellers),
    viewerOwnsBag('bp-anna', [{ bookingPassengerId: 'bp-erik', isYou: false }]),
    viewerOwnsBag('bp-anna', 'not json'),
  ]) {
    assert.equal(ownership, null)
    assert.equal(canUseOwnerActions(ownership), false)
  }
})

test('own-bag flow once confirmed: the owner gets owner-only controls back', () => {
  assert.equal(canUseOwnerActions(viewerOwnsBag('bp-anna', travellers)), true)
  assert.equal(canUseOwnerActions(viewerOwnsBag('bp-erik', travellers)), false)
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/** Mirrors the page: a generation counter, and state that is set only for a non-stale, still-current result. */
function casePageHarness() {
  let generation = 0
  let viewerIsBagOwner: boolean | null = null
  return {
    openCase() {
      generation += 1
      viewerIsBagOwner = null
      const requestId = generation
      return () => requestId === generation
    },
    async loadOwnership(request: () => Promise<OwnershipResponse>, reportBookingPassengerId: string, isCurrent: () => boolean) {
      const result = await resolveViewerOwnership(request, reportBookingPassengerId, isCurrent)
      if (result.stale || !isCurrent()) return
      viewerIsBagOwner = result.ownership
    },
    get ownerActionsAllowed() {
      return canUseOwnerActions(viewerIsBagOwner)
    },
    get ownership() {
      return viewerIsBagOwner
    },
  }
}

test('out-of-order: Case A JSON resolving after Case B opens cannot enable Case B owner-only controls', async () => {
  const page = casePageHarness()

  // Case A: the viewer owns this bag, but its JSON body is slow.
  const isCaseACurrent = page.openCase()
  const caseABody = deferred<unknown>()
  const caseAReading = deferred<void>()
  const caseA = page.loadOwnership(
    () =>
      Promise.resolve({
        ok: true,
        json: () => {
          caseAReading.resolve()
          return caseABody.promise
        },
      }),
    'bp-anna',
    isCaseACurrent,
  )
  // Case A has passed its first currency check and is reading its JSON body.
  await caseAReading.promise

  // Case B (the viewer does NOT own it) becomes current; its ownership is still loading.
  const isCaseBCurrent = page.openCase()
  const caseBBody = deferred<unknown>()
  const caseB = page.loadOwnership(() => Promise.resolve({ ok: true, json: () => caseBBody.promise }), 'bp-erik', isCaseBCurrent)

  // Case A's body arrives late with an owner result for Case A.
  caseABody.resolve(travellers)
  await caseA
  assert.equal(page.ownership, null, 'stale Case A result must not be applied')
  assert.equal(page.ownerActionsAllowed, false)

  // Case B's own result then applies normally (not the owner).
  caseBBody.resolve(travellers)
  await caseB
  assert.equal(page.ownership, false)
  assert.equal(page.ownerActionsAllowed, false)
})

test('out-of-order: a stale Case A request or body failure cannot overwrite Case B ownership', async () => {
  const page = casePageHarness()

  const isCaseACurrent = page.openCase()
  const caseARequest = deferred<OwnershipResponse>()
  const caseA = page.loadOwnership(() => caseARequest.promise, 'bp-anna', isCaseACurrent)
  const isCaseAPrimeCurrent = page.openCase()
  const caseAPrimeBody = deferred<unknown>()
  const caseAPrimeReading = deferred<void>()
  const caseAPrime = page.loadOwnership(
    () =>
      Promise.resolve({
        ok: true,
        json: () => {
          caseAPrimeReading.resolve()
          return caseAPrimeBody.promise
        },
      }),
    'bp-anna',
    isCaseAPrimeCurrent,
  )
  // Case A' is now reading its JSON body when the next case opens.
  await caseAPrimeReading.promise

  // Case B is current and confirmed as owned.
  const isCaseBCurrent = page.openCase()
  await page.loadOwnership(() => Promise.resolve({ ok: true, json: () => Promise.resolve(travellers) }), 'bp-anna', isCaseBCurrent)
  assert.equal(page.ownership, true)

  // Stale failures from earlier cases arrive afterwards: request rejection and body rejection.
  caseARequest.reject(new Error('network'))
  caseAPrimeBody.reject(new Error('bad json'))
  await Promise.all([caseA, caseAPrime])

  assert.equal(page.ownership, true, 'stale failures must not reset the current case')
  assert.equal(page.ownerActionsAllowed, true)
})

test('a stale non-OK response is dropped, and current failures still fail closed', async () => {
  const stale = await resolveViewerOwnership(
    () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    'bp-anna',
    () => false,
  )
  assert.deepEqual(stale, { stale: true })

  for (const request of [
    () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
    () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad json')) }),
    () => Promise.reject(new Error('network')),
  ]) {
    assert.deepEqual(await resolveViewerOwnership(request, 'bp-anna', () => true), { stale: false, ownership: null })
  }
})

test('a current, confirmed owner result enables owner-only controls (own-bag flow preserved)', async () => {
  const page = casePageHarness()
  const isCurrent = page.openCase()

  await page.loadOwnership(() => Promise.resolve({ ok: true, json: () => Promise.resolve(travellers) }), 'bp-anna', isCurrent)

  assert.equal(page.ownership, true)
  assert.equal(page.ownerActionsAllowed, true)
})

test('resolveViewerOwnership itself reports stale when the case changes while the JSON body is being read', async () => {
  let current = true
  const body = deferred<unknown>()
  const pending = resolveViewerOwnership(
    () => Promise.resolve({ ok: true, json: () => ((current = false), body.promise) }),
    'bp-anna',
    () => current,
  )

  body.resolve(travellers)

  // Without the re-check after response.json(), this would be { stale: false, ownership: true }.
  assert.deepEqual(await pending, { stale: true })
})
