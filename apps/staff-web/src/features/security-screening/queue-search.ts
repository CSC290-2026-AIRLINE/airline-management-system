import type { Filter, Sort } from './types'

export const filterStatuses = {
  'Needs review': 'needs-review',
  Held: 'held',
  Flagged: 'flagged',
  'Decided today': 'decided',
} as const satisfies Record<Filter, string>

export const statusFilters = {
  'needs-review': 'Needs review',
  held: 'Held',
  flagged: 'Flagged',
  decided: 'Decided today',
} as const satisfies Record<string, Filter>

export const sortLabels = {
  departure: 'Nearest departure',
  waiting: 'Waiting longest',
  match: 'Strongest match',
} as const satisfies Record<string, Sort>

export const sortValues = {
  'Nearest departure': 'departure',
  'Waiting longest': 'waiting',
  'Strongest match': 'match',
} as const

export interface QueueSearch {
  status: keyof typeof statusFilters
  q?: string
  sort?: keyof typeof sortLabels
  review?: string
}

export function validateQueueSearch(search: Record<string, unknown>): QueueSearch {
  return {
    status:
      typeof search.status === 'string' && Object.hasOwn(statusFilters, search.status)
        ? (search.status as QueueSearch['status'])
        : 'needs-review',
    q:
      typeof search.q === 'string' && search.q.length
        ? search.q
        : typeof search.q === 'number' && Number.isFinite(search.q)
          ? String(search.q)
          : undefined,
    sort: typeof search.sort === 'string' && Object.hasOwn(sortLabels, search.sort) ? (search.sort as QueueSearch['sort']) : undefined,
    review: typeof search.review === 'string' && search.review.length ? search.review : undefined,
  }
}
