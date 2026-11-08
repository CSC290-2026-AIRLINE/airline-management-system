import assert from 'node:assert/strict'
import test from 'node:test'
import { timelineEventLabel, type PassengerCaseTimelineEvent } from './passenger-case-summary-view.ts'

test('maps persisted passenger timeline entries to safe case-page labels', () => {
  const events: PassengerCaseTimelineEvent[] = [
    { type: 'report_received', occurredAt: '2026-10-18T21:05:00Z' },
    { type: 'case_marked_lost', occurredAt: '2026-10-19T21:05:00Z' },
    { type: 'match_confirmed', occurredAt: '2026-10-20T09:30:00Z' },
    { type: 'choice_saved', occurredAt: '2026-10-20T10:05:00Z', deliveryType: 'hotel', chosenBy: 'passenger' },
    { type: 'bag_sent', occurredAt: '2026-10-20T13:40:00Z', fromAirport: 'BKK', toAirport: 'NRT' },
    { type: 'bag_arrived', occurredAt: '2026-10-21T08:15:00Z', airport: 'NRT' },
    { type: 'out_for_delivery', occurredAt: '2026-10-21T08:15:00Z', airport: 'NRT' },
    { type: 'bag_delivered', occurredAt: '2026-10-21T09:00:00Z' },
    { type: 'case_closed', occurredAt: '2026-10-21T10:00:00Z' },
    { type: 'case_cancelled', occurredAt: '2026-10-21T10:00:00Z' },
  ]

  assert.deepEqual(events.map(timelineEventLabel), [
    'Report received',
    'Case marked lost',
    'Staff confirmed a found bag is yours',
    'You chose delivery to your hotel',
    'Bag sent from BKK to NRT',
    'Bag arrived at NRT',
    'Bag out for delivery at NRT',
    'Bag delivered',
    'Case closed',
    'Case cancelled',
  ])
})

test('does not imply that the passenger personally made a staff-recorded choice or collected a delivered bag', () => {
  assert.equal(
    timelineEventLabel({ type: 'choice_saved', occurredAt: '2026-10-20T10:05:00Z', deliveryType: 'home', chosenBy: 'staff' }),
    'Your home choice was recorded',
  )
  assert.equal(timelineEventLabel({ type: 'bag_delivered', occurredAt: '2026-10-21T09:00:00Z' }), 'Bag delivered')
})
