import type { screening_check, screening_review, passenger, watchlist_entry } from '@backend/db/generated/prisma/client'

export const now = new Date('2026-11-05T01:30:00Z')
export const passengerId = '10000000-0000-4000-8000-000000000001'
export const flightId = '20000000-0000-4000-8000-000000000001'
export const entryId = '30000000-0000-4000-8000-000000000001'
export const checkId = '40000000-0000-4000-8000-000000000001'
export const userId = '50000000-0000-4000-8000-000000000001'
export const staffId = '60000000-0000-4000-8000-000000000001'
export function passengerFixture(overrides: Partial<passenger> = {}): passenger {
  return {
    id: passengerId,
    first_name: 'MAYA',
    last_name: 'KORNSIRI',
    local_first_name: null,
    local_last_name: null,
    date_of_birth: new Date('1991-04-30'),
    gender: 'F',
    nationality: 'mm',
    passport_number: 'AB1237712',
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  }
}
export function entryFixture(overrides: Partial<watchlist_entry> = {}): watchlist_entry {
  return {
    id: entryId,
    first_name: 'MAYA',
    last_name: 'KORNSRI',
    date_of_birth: new Date('1990-04-30'),
    gender: 'F',
    nationality: 'mm',
    passport_number: 'CD1235520',
    list_type: 'no_fly',
    status: 'active',
    issuing_authority: 'Demo authority',
    reason: 'Synthetic test',
    listed_at: now,
    cleared_at: null,
    cleared_by_staff_id: null,
    clear_reason: null,
    created_by_staff_id: staffId,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}
export function checkFixture(overrides: Partial<screening_check> = {}): screening_check {
  const p = passengerFixture(),
    e = entryFixture()
  return {
    id: checkId,
    run_id: checkId,
    passenger_id: p.id,
    flight_id: flightId,
    pnr_id: null,
    trigger_point: 'check_in',
    watchlist_entry_id: e.id,
    match_level: 'probable',
    outcome: 'held',
    occurred_at: now,
    created_at: now,
    name_similarity: 0.7,
    snap_first_name: p.first_name,
    snap_last_name: p.last_name,
    snap_date_of_birth: p.date_of_birth,
    snap_gender: p.gender,
    snap_nationality: p.nationality,
    snap_passport: p.passport_number,
    snap_entry_first_name: e.first_name,
    snap_entry_last_name: e.last_name,
    snap_entry_date_of_birth: p.date_of_birth,
    snap_entry_gender: e.gender,
    snap_entry_nationality: e.nationality,
    snap_entry_passport: e.passport_number,
    ...overrides,
  }
}
export function reviewFixture(overrides: Partial<screening_review> = {}): screening_review {
  return {
    id: '80000000-0000-4000-8000-000000000001',
    screening_check_id: checkId,
    decision: 'false_positive',
    reviewed_by_staff_id: staffId,
    review_note: 'Passport compared at counter',
    reviewed_at: now,
    created_at: now,
    authority_notified_at: null,
    revision: 1,
    ...overrides,
  }
}
