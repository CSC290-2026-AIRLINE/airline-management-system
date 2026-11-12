import type { FlightSearchFormValue } from './contracts'

/** The field an issue belongs to, so the message can be shown under that field. */
export type SearchField =
  { kind: 'leg'; legIndex: number; field: 'origin' | 'destination' | 'date' } | { kind: 'party'; field: 'adults' | 'children' | 'infants' }

export interface SearchIssue {
  /** The field the message belongs to. */
  field: SearchField
  /** The key of that field, so a message can be found again for the field it belongs to. */
  key: string
  /** The message under the field. */
  message: string
  /** The message in the summary under the form. */
  summary: string
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The key of a field. It is also the id of the element of that field. */
export function fieldKey(field: SearchField): string {
  return field.kind === 'leg' ? `f3-leg-${field.legIndex}-${field.field}` : `f3-party-${field.field}`
}

/**
 * Everything that is wrong with the form, one issue per field. The form shows each message under the field it belongs
 * to, and the first issue is the summary under the form.
 */
export function searchIssues(value: FlightSearchFormValue): SearchIssue[] {
  const issues: SearchIssue[] = []
  const party = value.adults + value.children
  if (party < 1 || party > 9) {
    issues.push({
      field: { kind: 'party', field: 'adults' },
      key: fieldKey({ kind: 'party', field: 'adults' }),
      message: party < 1 ? 'Choose at least one adult or child.' : 'Up to 9 adults and children travel together.',
      summary: 'Choose between 1 and 9 adults and children.',
    })
  }
  if (value.infants > value.adults) {
    issues.push({
      field: { kind: 'party', field: 'infants' },
      key: fieldKey({ kind: 'party', field: 'infants' }),
      message: 'Each lap infant needs an adult of its own.',
      summary: 'Each lap infant must travel with a different adult.',
    })
  }
  for (const [index, leg] of value.legs.entries()) {
    const origin = /^[A-Z]{3}$/.test(leg.origin)
    const destination = /^[A-Z]{3}$/.test(leg.destination)
    if (!origin) {
      issues.push({
        field: { kind: 'leg', legIndex: index, field: 'origin' },
        key: fieldKey({ kind: 'leg', legIndex: index, field: 'origin' }),
        message: 'Choose the airport you fly from.',
        summary: `Choose an airport for both ends of leg ${index + 1}.`,
      })
    }
    if (!destination) {
      issues.push({
        field: { kind: 'leg', legIndex: index, field: 'destination' },
        key: fieldKey({ kind: 'leg', legIndex: index, field: 'destination' }),
        message: 'Choose the airport you fly to.',
        summary: `Choose an airport for both ends of leg ${index + 1}.`,
      })
    }
    if (origin && destination && leg.origin === leg.destination) {
      issues.push({
        field: { kind: 'leg', legIndex: index, field: 'destination' },
        key: fieldKey({ kind: 'leg', legIndex: index, field: 'destination' }),
        message: 'Choose two different airports.',
        summary: `Choose different airports for leg ${index + 1}.`,
      })
    }
    if (!leg.date || leg.date < today()) {
      issues.push({
        field: { kind: 'leg', legIndex: index, field: 'date' },
        key: fieldKey({ kind: 'leg', legIndex: index, field: 'date' }),
        message: 'Choose today or a later date.',
        summary: `Choose today or a future date for leg ${index + 1}.`,
      })
    } else if (index > 0 && leg.date < value.legs[index - 1].date) {
      issues.push({
        field: { kind: 'leg', legIndex: index, field: 'date' },
        key: fieldKey({ kind: 'leg', legIndex: index, field: 'date' }),
        message: 'This date must be on or after the date of the leg before it.',
        summary: 'Flight dates must be in travel order.',
      })
    }
  }
  return issues
}

/** The first problem with the form, as one line of text. */
export function validateSearch(value: FlightSearchFormValue): string | null {
  return searchIssues(value)[0]?.summary ?? null
}
