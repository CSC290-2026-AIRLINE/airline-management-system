/**
 * Bag types and colours follow the Feature 10 schema.
 * Same lists as the CHECKs on lost_bag_report and found_bag (migration 20261106120100_feature10_lost_and_found).
 */
export const BAG_TYPES = ['suitcase', 'backpack', 'duffel', 'box', 'garment_bag', 'sports_equipment', 'stroller', 'other'] as const

export const BAG_COLOURS = [
  'black',
  'white',
  'grey',
  'blue',
  'red',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
  'brown',
  'beige',
  'multi',
] as const

export type BagType = (typeof BAG_TYPES)[number]
export type BagColour = (typeof BAG_COLOURS)[number]

export const REPORT_STATUSES = ['open', 'matched', 'delivering', 'lost', 'closed', 'cancelled'] as const

export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** audit_log.source_feature of every row Feature 10 writes. */
export const AUDIT_SOURCE_FEATURE = '10'

/** The most rows a staff list endpoint returns, newest first, so one call cannot read a whole table of passenger data. */
export const MAX_LIST_ROWS = 500
