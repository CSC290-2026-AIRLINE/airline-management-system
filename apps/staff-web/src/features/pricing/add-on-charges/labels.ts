import type { SeatType, TaxFeeCalcType, TaxFeeKind } from './api'

export function seatTypeLabel(seatType: SeatType): string {
  switch (seatType) {
    case 'normal':
      return 'Normal'
    case 'exit_row':
      return 'Exit row'
    case 'extra_legroom':
      return 'Extra legroom'
    default: {
      const unknown: never = seatType
      return unknown
    }
  }
}

export function taxKindLabel(kind: TaxFeeKind): string {
  switch (kind) {
    case 'tax':
      return 'Tax'
    case 'surcharge':
      return 'Surcharge'
    case 'fee':
      return 'Fee'
    default: {
      const unknown: never = kind
      return unknown
    }
  }
}

export function calcTypeLabel(calcType: TaxFeeCalcType): string {
  switch (calcType) {
    case 'flat':
      return 'Flat amount'
    case 'pct':
      return 'Percentage'
    default: {
      const unknown: never = calcType
      return unknown
    }
  }
}

// The table's shorter wording; calcTypeLabel is for the form.
export function calcTypeShortLabel(calcType: TaxFeeCalcType): string {
  switch (calcType) {
    case 'flat':
      return 'Flat'
    case 'pct':
      return 'Percent'
    default: {
      const unknown: never = calcType
      return unknown
    }
  }
}

// "7%" for a percentage, "5 USD" for a flat amount.
export function taxValueLabel(calcType: TaxFeeCalcType, value: string | number, currency: string): string {
  return calcType === 'pct' ? `${Number(value)}%` : `${Number(value)} ${currency}`
}

// "BKK–SIN", or "All routes" for a fare class's default rate.
export function routeLabel(route: { origin: string; destination: string } | null): string {
  return route ? `${route.origin}–${route.destination}` : 'All routes'
}
