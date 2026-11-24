import type { SelfRegisterScreen } from '@backend/modules/admin-console/dto/admin-console.types'

/**
 * Every staff screen Feature 5 owns, in one list.
 *
 * `registerSelfScreens` treats the list it is given as the feature's whole set: any other `f5.` screen is turned off. 5a
 * and 5b each register at startup, so if each passed only its own screens, the one that ran last would switch the other's
 * off (Payment lookup and Payment exceptions vanished that way, with "isn't part of the Admin role"). Both modules register
 * this full list instead, and a test checks that every screen a route asks for is on it.
 */
export const F5_SCREENS: SelfRegisterScreen[] = [
  { code: 'f5.payment_lookup', name: 'Payment lookup', kind: 'assignable', feature_no: '5' },
  { code: 'f5.payment_exceptions', name: 'Payment exceptions', kind: 'assignable', feature_no: '5' },
  { code: 'f5.refund_queue', name: 'Refund queue', kind: 'assignable', feature_no: '5' },
  { code: 'f5.compensation_vouchers', name: 'Compensation & vouchers', kind: 'assignable', feature_no: '5' },
]
