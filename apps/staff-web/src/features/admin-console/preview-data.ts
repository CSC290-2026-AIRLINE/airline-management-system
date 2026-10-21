/**
 * Sample data for `?preview=1` design-preview mode. Used by Role access and Audit log when the URL has
 * ?preview=1 — useful for visual review before the backend has any rows.
 *
 * Distinct from real fixtures: clearly gated behind an explicit URL flag and visually labelled.
 */

import type { AuditPage, RoleScreensResponse, RoleSummary, ScreenDto, ScreenGroup } from './types'

/* ----- Role access preview --------------------------------------------------- */

export const previewScreenGroups: { groups: ScreenGroup[] } = {
  groups: [
    { feature_no: '00', screens: [core('home', 'Home'), core('my_profile', 'My profile')] },
    {
      feature_no: '05',
      screens: [assignable('05', 'payments', 'Payments'), assignable('05', 'refunds', 'Refunds'), assignable('05', 'reports', 'Reports')],
    },
    {
      feature_no: '06',
      screens: [assignable('06', 'check_in_counter', 'Check-in counter'), assignable('06', 'gate_screen', 'Gate screen')],
    },
    { feature_no: '02', screens: [assignable('02', 'flight_schedule', 'Flight schedule')] },
    { feature_no: '08', screens: [assignable('08', 'crew', 'Crew')] },
    { feature_no: '10', screens: [assignable('10', 'baggage_tracking', 'Baggage tracking')] },
    { feature_no: '09', screens: [assignable('09', 'aircraft_maintenance', 'Aircraft maintenance')] },
    {
      feature_no: '13',
      screens: [assignable('13', 'complaint_queue', 'Complaint queue'), assignable('13', 'notifications', 'Notifications')],
    },
    { feature_no: '14', screens: [assignable('14', 'bi_dashboard', 'BI dashboard')] },
    {
      feature_no: '15',
      screens: [admin('staff_roles', 'Staff & roles'), admin('role_access', 'Role access'), admin('audit_log', 'Audit log')],
    },
  ],
}

export const previewRoles: { roles: RoleSummary[] } = {
  roles: [
    { id: 'r-finance', code: 'finance_staff', name: 'Finance Staff', is_admin: false, staff_count: 4 },
    { id: 'r-admin', code: 'admin', name: 'Administrator', is_admin: true, staff_count: 3 },
    { id: 'r-gate', code: 'gate_agent', name: 'Gate agent', is_admin: false, staff_count: 8 },
  ],
}

export const previewRoleScreens: Record<string, RoleScreensResponse> = {
  /* Mirrors the design mock: core is always on, Finance Staff sees payments + refunds + reports + complaint queue. */
  'r-finance': { screen_ids: ['p00-home', 'p00-my_profile', 'p05-payments', 'p05-refunds', 'p05-reports', 'p13-complaint_queue'] },
  'r-admin': {
    screen_ids: previewScreenGroups.groups.flatMap((g) => g.screens.map((s) => s.id)),
  },
  'r-gate': { screen_ids: ['p00-home', 'p00-my_profile', 'p06-gate_screen'] },
}

/* Screen builders — keep the id scheme readable so `previewRoleScreens` above can be checked by eye. */
function core(name: string, label: string): ScreenDto {
  return { id: `p00-${name}`, feature_no: '00', code: `core.${name}`, name: label, kind: 'core', is_active: true }
}
function assignable(featureNo: string, name: string, label: string): ScreenDto {
  return {
    id: `p${featureNo}-${name}`,
    feature_no: featureNo,
    code: `f${featureNo}.${name}`,
    name: label,
    kind: 'assignable',
    is_active: true,
  }
}
function admin(name: string, label: string): ScreenDto {
  return { id: `p15-${name}`, feature_no: '15', code: `f15.${name}`, name: label, kind: 'admin', is_active: true }
}

/* ----- Audit log preview ----------------------------------------------------- */

export const previewAudit: AuditPage = {
  items: [
    {
      seq: '1042',
      id: 'a-1042',
      occurred_at: '2026-10-21T09:14:22.000Z',
      recorded_at: '2026-10-21T09:14:22.103Z',
      actor_type: 'staff',
      actor_id: 'u-7f3a',
      actor_role: 'admin',
      source_feature: '15',
      action: 'screen_access_change',
      entity_type: 'role',
      entity_id: 'r-staff',
      summary: 'Granted seat_hold + check_in to staff',
      reason: 'Q4 onboarding batch — ticket FIN-481',
      before: null,
      after: { screen_ids: ['p3-1', 'p3-2', 'p1-1', 'p1-2'] },
      is_sensitive: false,
    },
    {
      seq: '1041',
      id: 'a-1041',
      occurred_at: '2026-10-21T08:51:09.000Z',
      recorded_at: '2026-10-21T08:51:09.072Z',
      actor_type: 'staff',
      actor_id: 'u-2c81',
      actor_role: 'admin',
      source_feature: '15',
      action: 'role_change',
      entity_type: 'staff',
      entity_id: 's-291',
      summary: 'Promoted Akara Thong to Gate agent',
      reason: 'Position change request — HR ticket 2481',
      before: null,
      after: { role: 'gate_agent' },
      is_sensitive: true,
    },
    {
      seq: '1040',
      id: 'a-1040',
      occurred_at: '2026-10-21T08:30:18.000Z',
      recorded_at: '2026-10-21T08:30:18.220Z',
      actor_type: 'staff',
      actor_id: 'u-7f3a',
      actor_role: 'admin',
      source_feature: '15',
      action: 'create',
      entity_type: 'staff',
      entity_id: 's-302',
      summary: 'Created staff account for Pichaya Lim',
      reason: null,
      before: null,
      after: { email: 'pichaya.lim@example.com', role: 'staff' },
      is_sensitive: false,
    },
    {
      seq: '1039',
      id: 'a-1039',
      occurred_at: '2026-10-21T08:14:55.000Z',
      recorded_at: '2026-10-21T08:14:55.044Z',
      actor_type: 'customer',
      actor_id: 'c-90012',
      actor_role: null,
      source_feature: '03',
      action: 'booking_lifecycle',
      entity_type: 'booking',
      entity_id: 'b-77128',
      summary: 'Booking #b-77128 confirmed (BKK → NRT, 2 pax)',
      reason: null,
      before: { status: 'pending_payment' },
      after: { status: 'confirmed' },
      is_sensitive: false,
    },
    {
      seq: '1038',
      id: 'a-1038',
      occurred_at: '2026-10-21T07:58:30.000Z',
      recorded_at: '2026-10-21T07:58:30.018Z',
      actor_type: 'staff',
      actor_id: 'u-5d22',
      actor_role: 'gate_agent',
      source_feature: '03',
      action: 'update',
      entity_type: 'seat_hold',
      entity_id: 'sh-1192',
      summary: 'Released seat 14C after no-show',
      reason: null,
      before: { state: 'held' },
      after: { state: 'released' },
      is_sensitive: false,
    },
    {
      seq: '1037',
      id: 'a-1037',
      occurred_at: '2026-10-21T07:44:11.000Z',
      recorded_at: '2026-10-21T07:44:11.330Z',
      actor_type: 'staff',
      actor_id: 'u-9b00',
      actor_role: 'staff',
      source_feature: '03',
      action: 'login',
      entity_type: 'session',
      entity_id: 'ses-40911',
      summary: 'Sign-in via web — 192.168.4.21 (Bangkok)',
      reason: null,
      before: null,
      after: null,
      is_sensitive: false,
    },
    {
      seq: '1036',
      id: 'a-1036',
      occurred_at: '2026-10-21T07:30:01.000Z',
      recorded_at: '2026-10-21T07:30:01.412Z',
      actor_type: 'system',
      actor_id: null,
      actor_role: null,
      source_feature: '07',
      action: 'payment_capture',
      entity_type: 'payment',
      entity_id: 'pay-2208',
      summary: 'Captured ฿12,400 for booking #b-77128',
      reason: null,
      before: { status: 'authorized' },
      after: { status: 'captured' },
      is_sensitive: false,
    },
  ],
  next_cursor: null,
  has_more: false,
}
