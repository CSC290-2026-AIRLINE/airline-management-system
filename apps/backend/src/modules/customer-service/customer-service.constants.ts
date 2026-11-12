import type { SelfRegisterScreen } from '../admin-console/dto/admin-console.types'

// Mirrors the CHECK constraints in migration 20261106120200_feature13_customer_service.
export const COMPLAINT_TYPES = ['employee', 'flight', 'food'] as const
export type ComplaintType = (typeof COMPLAINT_TYPES)[number]

export const CASE_STATUSES = ['with_supervisor', 'assigned', 'resolved', 'closed'] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const EMPLOYEE_LOCATIONS = ['check_in', 'gate', 'onboard', 'call_centre', 'other'] as const
// 'lost_bag' is left out: lost-bag cases come from Feature 10's report, not from the complaint form.
export const FLIGHT_ISSUES = ['delay', 'cancellation', 'seat', 'cleanliness', 'other'] as const
export const FOOD_ISSUES = ['wrong_meal', 'quality', 'allergy', 'missing', 'other'] as const

/** The staff screen, named like its sidebar entry so the Role access preview matches it. */
export const F13_SCREENS: SelfRegisterScreen[] = [
  { code: 'f13.service_compensation', name: 'Service & Compensation', kind: 'assignable', feature_no: '13' },
]
