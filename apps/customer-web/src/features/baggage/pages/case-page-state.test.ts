import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createPassengerCasePageState,
  isCurrentCaseRequest,
  passengerCasePageReducer,
  passengerDeliveryFormKey,
} from './case-page-state.ts'

interface Report {
  caseNumber: string
}

interface Delivery {
  deliveryType: string | null
  address: string | null
  pickupAirport: string | null
  status: string
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('stale case responses, errors, and loading cleanup cannot replace a newer lookup', async () => {
  let currentRequestId = 1
  const page = { report: '', error: '', isLookingUp: true }
  const oldRequest = deferred<string>()
  const newRequest = deferred<string>()

  const settle = async (requestId: number, promise: Promise<string>) => {
    try {
      const result = await promise
      if (isCurrentCaseRequest(requestId, currentRequestId)) page.report = result
    } catch (error) {
      if (isCurrentCaseRequest(requestId, currentRequestId)) page.error = (error as Error).message
    } finally {
      if (isCurrentCaseRequest(requestId, currentRequestId)) page.isLookingUp = false
    }
  }

  const oldLookup = settle(1, oldRequest.promise)
  currentRequestId = 2
  page.isLookingUp = true
  const newLookup = settle(2, newRequest.promise)

  oldRequest.reject(new Error('stale authorization error'))
  await oldLookup
  assert.deepEqual(page, { report: '', error: '', isLookingUp: true })

  newRequest.resolve('new case')
  await newLookup
  assert.deepEqual(page, { report: 'new case', error: '', isLookingUp: false })
})

test('an out-of-order older case success cannot overwrite the latest case', async () => {
  let currentRequestId = 1
  const page = { report: '' }
  const oldRequest = deferred<string>()
  const newRequest = deferred<string>()
  const settle = async (requestId: number, promise: Promise<string>) => {
    const result = await promise
    if (isCurrentCaseRequest(requestId, currentRequestId)) page.report = result
  }

  const oldLookup = settle(1, oldRequest.promise)
  currentRequestId = 2
  const newLookup = settle(2, newRequest.promise)
  newRequest.resolve('new case')
  await newLookup
  oldRequest.resolve('old case')
  await oldLookup

  assert.equal(page.report, 'new case')
})

test('an authoritative delivery refresh replaces the choice and increments the form revision', () => {
  const report = { caseNumber: 'LB-2026-000001' }
  const unsavedDelivery = { deliveryType: 'hotel', address: 'Unsaved address', pickupAirport: null, status: 'waiting_choice' }
  const savedDelivery = { deliveryType: 'home', address: 'Saved address', pickupAirport: null, status: 'in_transit' }
  const initial = passengerCasePageReducer(createPassengerCasePageState<Report, Delivery>(), {
    type: 'report-loaded',
    report,
  })
  const withUnsavedChoice = passengerCasePageReducer(initial, { type: 'delivery-loaded', delivery: unsavedDelivery })
  const previousFormKey = passengerDeliveryFormKey(report.caseNumber, withUnsavedChoice.deliveryFormRevision)

  const refreshed = passengerCasePageReducer(withUnsavedChoice, { type: 'delivery-loaded', delivery: savedDelivery })

  assert.equal(refreshed.report, report)
  assert.deepEqual(refreshed.delivery, savedDelivery)
  assert.equal(refreshed.deliveryFormRevision, withUnsavedChoice.deliveryFormRevision + 1)
  assert.notEqual(passengerDeliveryFormKey(report.caseNumber, refreshed.deliveryFormRevision), previousFormKey)
  assert.equal(refreshed.deliveryError, '')
})

test('a delivery load failure keeps the report while clearing the delivery form and recording a delivery error', () => {
  const report = { caseNumber: 'LB-2026-000001' }
  const delivery = { deliveryType: 'home', address: 'Saved address', pickupAirport: null, status: 'waiting_choice' }
  const withCase = passengerCasePageReducer(createPassengerCasePageState<Report, Delivery>(), {
    type: 'report-loaded',
    report,
  })
  const withDelivery = passengerCasePageReducer(withCase, { type: 'delivery-loaded', delivery })

  const failed = passengerCasePageReducer(withDelivery, {
    type: 'delivery-failed',
    message: 'Delivery details could not be loaded. Reopen the case to try again.',
  })

  assert.equal(failed.report, report)
  assert.equal(failed.delivery, null)
  assert.equal(failed.deliveryUnavailable, false)
  assert.equal(failed.deliveryError, 'Delivery details could not be loaded. Reopen the case to try again.')
  assert.equal(failed.deliveryFormRevision, withDelivery.deliveryFormRevision + 1)
})
