import type { SelfRegisterScreen } from '../admin-console/dto/admin-console.types'

/**
 * Screens Feature 8 registers with the admin console on boot, one per item in the staff-web sidebar's "Crew & Rostering"
 * group. They are `assignable`, so Role access can grant them. The codes match `CREW_ITEMS` in staff-web's `nav-items.ts`.
 */
export const F08_SCREENS: SelfRegisterScreen[] = [
  { code: 'f08.roster_runs', name: 'Roster runs', kind: 'assignable', feature_no: '8' },
  { code: 'f08.crew', name: 'Crew', kind: 'assignable', feature_no: '8' },
  { code: 'f08.rules', name: 'Rules', kind: 'assignable', feature_no: '8' },
]
