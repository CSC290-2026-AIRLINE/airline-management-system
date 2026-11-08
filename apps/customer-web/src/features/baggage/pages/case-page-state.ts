export interface PassengerCasePageState<Report, Delivery> {
  report: Report | null
  delivery: Delivery | null
  deliveryUnavailable: boolean
  deliveryError: string
  deliveryFormRevision: number
}

export type PassengerCasePageAction<Report, Delivery> =
  | { type: 'reset' }
  | { type: 'report-loaded'; report: Report }
  | { type: 'delivery-loaded'; delivery: Delivery }
  | { type: 'delivery-missing' }
  | { type: 'delivery-failed'; message: string }

export function createPassengerCasePageState<Report, Delivery>(): PassengerCasePageState<Report, Delivery> {
  return {
    report: null,
    delivery: null,
    deliveryUnavailable: false,
    deliveryError: '',
    deliveryFormRevision: 0,
  }
}

export function passengerDeliveryFormKey(caseNumber: string, revision: number): string {
  return `${caseNumber}-${revision}`
}

export function passengerCasePageReducer<Report, Delivery>(
  state: PassengerCasePageState<Report, Delivery>,
  action: PassengerCasePageAction<Report, Delivery>,
): PassengerCasePageState<Report, Delivery> {
  switch (action.type) {
    case 'reset':
      return { ...createPassengerCasePageState<Report, Delivery>(), deliveryFormRevision: state.deliveryFormRevision + 1 }
    case 'report-loaded':
      return { ...state, report: action.report }
    case 'delivery-loaded':
      return {
        ...state,
        delivery: action.delivery,
        deliveryUnavailable: false,
        deliveryError: '',
        deliveryFormRevision: state.deliveryFormRevision + 1,
      }
    case 'delivery-missing':
      return {
        ...state,
        delivery: null,
        deliveryUnavailable: true,
        deliveryError: '',
        deliveryFormRevision: state.deliveryFormRevision + 1,
      }
    case 'delivery-failed':
      return {
        ...state,
        delivery: null,
        deliveryUnavailable: false,
        deliveryError: action.message,
        deliveryFormRevision: state.deliveryFormRevision + 1,
      }
  }
}
