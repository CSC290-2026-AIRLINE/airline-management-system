import assert from 'node:assert/strict'
import test from 'node:test'
import {
  backToParent,
  openPerson,
  parseCustomerSearch,
  profileScopeFor,
  resolveCustomerSearch,
  toCustomerSearchParams,
  toPersonKind,
  withCustomerSearch,
} from './searchParams.ts'
import type { Person } from '../types'

/** A person row, reduced to what the navigation needs. */
function person(id: string, type: Person['type']): Person {
  return {
    id,
    type,
    firstName: 'Test',
    lastName: 'Person',
    localFirstName: null,
    localLastName: null,
    thaiName: null,
    dateOfBirth: null,
    gender: null,
    nationality: null,
    passportNumber: null,
    email: null,
    phone: null,
    memberSince: null,
  }
}

const HOLDER = person('11111111-1111-4111-8111-111111111111', 'accountHolder')
const TRAVELLER = person('22222222-2222-4222-8222-222222222222', 'traveller')

/** The Account holders tab, with nothing open. */
function accountHolderTab() {
  return resolveCustomerSearch({ type: 'account-holder' })
}

test('opens an account holder from the list on the account-holder route', () => {
  const opened = openPerson(accountHolderTab(), HOLDER, null)

  assert.equal(opened.person, HOLDER.id)
  assert.equal(opened.personType, 'account-holder')
  assert.equal(profileScopeFor(opened.personType), 'accountHolder')
  assert.equal(opened.from, null)
})

test('opens a saved traveller on the passenger route, not the account-holder one', () => {
  const holder = openPerson(accountHolderTab(), HOLDER, null)
  const traveller = openPerson(holder, TRAVELLER, { id: HOLDER.id, type: 'account-holder' })

  assert.equal(traveller.person, TRAVELLER.id)
  assert.equal(traveller.personType, 'traveller')
  // The Account holders tab is still selected here, and the account-holder route
  // answers a traveller with a 404 — the passenger route answers both kinds.
  assert.equal(traveller.type, 'account-holder')
  assert.equal(profileScopeFor(traveller.personType), 'passenger')
  assert.equal(traveller.from, HOLDER.id)
  assert.equal(traveller.fromType, 'account-holder')
})

test('Back returns to the account holder the traveller was opened from', () => {
  const holder = openPerson(accountHolderTab(), HOLDER, null)
  const traveller = openPerson(holder, TRAVELLER, { id: HOLDER.id, type: 'account-holder' })
  const back = backToParent(traveller)

  assert.equal(back.person, HOLDER.id)
  assert.equal(back.personType, 'account-holder')
  assert.equal(profileScopeFor(back.personType), 'accountHolder')
  assert.equal(back.from, null)
  assert.equal(back.fromType, null)
})

test('Back closes a profile that was opened from the list', () => {
  const back = backToParent(openPerson(accountHolderTab(), HOLDER, null))

  assert.equal(back.person, null)
  assert.equal(back.personType, null)
  assert.equal(back.from, null)
})

test('closing a profile clears its kind and the profile it was opened from', () => {
  const holder = openPerson(accountHolderTab(), HOLDER, null)
  const traveller = openPerson(holder, TRAVELLER, { id: HOLDER.id, type: 'account-holder' })
  const closed = withCustomerSearch(traveller, { person: null })

  assert.equal(closed.person, null)
  assert.equal(closed.personType, null)
  assert.equal(closed.from, null)
  assert.equal(closed.fromType, null)
})

test('a new search closes the open profile and what it was opened from', () => {
  const holder = openPerson(accountHolderTab(), HOLDER, null)
  const traveller = openPerson(holder, TRAVELLER, { id: HOLDER.id, type: 'account-holder' })
  const next = withCustomerSearch(traveller, { type: 'traveller', page: 1 })

  assert.equal(next.person, null)
  assert.equal(next.personType, null)
  assert.equal(next.from, null)
})

test('the open profile survives the URL round trip', () => {
  const holder = openPerson(accountHolderTab(), HOLDER, null)
  const traveller = openPerson(holder, TRAVELLER, { id: HOLDER.id, type: 'account-holder' })

  const params = toCustomerSearchParams(traveller)
  assert.equal(params.person, TRAVELLER.id)
  assert.equal(params.personType, 'traveller')
  assert.equal(params.from, HOLDER.id)
  assert.equal(params.fromType, 'account-holder')

  assert.deepEqual(resolveCustomerSearch(params), traveller)
})

test('a profile whose kind the URL does not carry is read from the passenger route', () => {
  const params = parseCustomerSearch({ type: 'account-holder', person: TRAVELLER.id })

  assert.equal(params.personType, undefined)
  assert.equal(profileScopeFor(resolveCustomerSearch(params).personType), 'passenger')
})

test('the kind and the parent are dropped when no profile is open', () => {
  const params = parseCustomerSearch({ personType: 'traveller', from: HOLDER.id, fromType: 'account-holder' })

  assert.equal(params.personType, undefined)
  assert.equal(params.from, undefined)
  assert.equal(params.fromType, undefined)
})

test("the API's spelling of a kind becomes the URL's", () => {
  assert.equal(toPersonKind('accountHolder'), 'account-holder')
  assert.equal(toPersonKind('traveller'), 'traveller')
})
