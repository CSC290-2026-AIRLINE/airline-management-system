import type { SelfRegisterScreen } from '@backend/modules/admin-console/dto/admin-console.types'

/**
 * Screens Feature 6 registers with the admin console on boot, one per staff-web page under `/check-in/*`. They are
 * `assignable`, so they show up as tickable rows under the Feature 6 label "CHECK-IN" in Role access (the sidebar
 * group is called "Check-in & Boarding"). The codes match `CHECKIN_ITEMS` in staff-web `nav-items.ts`.
 */
export const F06_SCREENS: SelfRegisterScreen[] = [
  { code: 'f06.counter', name: 'Check-in counter', kind: 'assignable', feature_no: '6' },
  { code: 'f06.issues', name: 'Issue list', kind: 'assignable', feature_no: '6' },
  { code: 'f06.gate', name: 'Gate', kind: 'assignable', feature_no: '6' },
]
