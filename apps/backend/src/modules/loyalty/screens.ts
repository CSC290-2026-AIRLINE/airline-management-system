import type { SelfRegisterScreen } from '@backend/modules/admin-console/dto/admin-console.types'

/** The role the F11 doc names for the staff routes. Admin roles and roles granted an `f11.*` screen also pass. */
export const LOYALTY_ROLE_CODE = 'loyalty-admin'

export const F11_SCREEN_PREFIX = 'f11.'

/** The four staff-web loyalty pages, registered with the admin console at boot so admins can grant them to roles. */
export const F11_SCREENS: SelfRegisterScreen[] = [
  { code: 'f11.member_lookup', name: 'Loyalty · Member lookup', kind: 'assignable', feature_no: '11' },
  { code: 'f11.loyalty_rules', name: 'Loyalty · Rules', kind: 'assignable', feature_no: '11' },
  { code: 'f11.award_release', name: 'Loyalty · Award release', kind: 'assignable', feature_no: '11' },
  { code: 'f11.lounge_desk', name: 'Loyalty · Lounge desk', kind: 'assignable', feature_no: '11' },
]
