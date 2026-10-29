/**
 * Bag types and colours follow the proposed Feature 10 schema.
 * Source: feature-10-schema-review.md
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
