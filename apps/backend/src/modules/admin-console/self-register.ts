import type { SelfRegisterScreen } from './dto/admin-console.types'

/**
 * Screens the admin-console module registers for itself on first boot. `core.home` and `core.my_profile` are the two
 * baseline screens every role holds via `kind = 'core'`; they never appear in `role_screen`. F15's three admin screens
 * also never appear in `role_screen` because `CHECK (screen_kind = 'assignable')`.
 *
 * Feature number prefix follows the convention in `src/db/schema.sql`'s `screen.code` comment.
 */
export const F15_SCREENS: SelfRegisterScreen[] = [
  { code: 'f15.staff_roles', name: 'Staff & roles', kind: 'admin', feature_no: '15' },
  { code: 'f15.role_access', name: 'Role access', kind: 'admin', feature_no: '15' },
  { code: 'f15.audit_log', name: 'Audit log', kind: 'admin', feature_no: '15' },
]

export const CORE_SCREENS: SelfRegisterScreen[] = [
  { code: 'core.home', name: 'Home', kind: 'core', feature_no: '1' },
  { code: 'core.my_profile', name: 'My profile', kind: 'core', feature_no: '1' },
]

/** Concatenated list F15 owns and self-registers on `OnModuleInit`. */
export const SELF_REGISTER_SCREENS: SelfRegisterScreen[] = [...F15_SCREENS, ...CORE_SCREENS]
