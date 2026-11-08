import assert from 'node:assert/strict'
import test from 'node:test'
import { createPassengerCasePageState, passengerCasePageReducer, passengerDeliveryFormKey } from './case-page-state.ts'

interface Report {
  caseNumber: string
}

interface Delivery {
  deliveryType: string | null
  address: string | null
  pickupAirport: string | null
  status: string
}

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
