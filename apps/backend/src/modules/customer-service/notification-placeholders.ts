/**
 * The placeholders each notification type may use, taken from the default templates seeded in schema.sql
 * (INSERT INTO notification_template). The sender fills exactly these names, so a template using any other
 * name is rejected with INVALID_PLACEHOLDER. A type missing here allows no placeholders.
 */
export const NOTIFICATION_PLACEHOLDERS: Record<string, readonly string[]> = {
  // Feature 2
  flight_delayed: ['passenger_name', 'flight_number', 'service_date', 'new_departure'],
  flight_rescheduled: ['passenger_name', 'flight_number', 'service_date', 'new_departure'],
  flight_diverted: ['passenger_name', 'flight_number', 'service_date', 'diverted_to'],
  flight_cancelled: ['passenger_name', 'flight_number', 'service_date'],
  // Feature 5
  payment_received: ['passenger_name', 'reference', 'amount', 'document_number'],
  refund_issued: ['passenger_name', 'reference', 'amount'],
  refund_failed: ['passenger_name', 'reference', 'amount'],
  voucher_issued: ['passenger_name', 'amount', 'voucher_code', 'expires_on'],
  // Feature 6
  check_in_completed: ['passenger_name', 'flight_number', 'service_date'],
  boarding_pass_issued: ['passenger_name', 'flight_number', 'service_date', 'seat', 'boarding_time'],
  gate_changed: ['passenger_name', 'flight_number', 'service_date', 'gate'],
  boarding_call: ['passenger_name', 'flight_number', 'gate'],
  // Feature 7
  security_alert: ['passenger_name', 'flight_number', 'service_date', 'reference'],
  security_alert_withdrawn: ['passenger_name', 'flight_number', 'service_date', 'reference'],
  // Feature 10
  bag_case_updated: ['passenger_name', 'case_number', 'status'],
  bag_delivery_updated: ['passenger_name', 'case_number', 'delivery_status'],
  // Feature 11
  miles_expiring: ['passenger_name', 'miles', 'expires_on'],
  tier_changed: ['passenger_name', 'tier_name', 'tier_expires_on'],
  cabin_upgraded: ['passenger_name', 'flight_number', 'service_date', 'tier_name', 'to_cabin'],
  // Feature 13
  complaint_received: ['passenger_name', 'case_number'],
  complaint_updated: ['passenger_name', 'case_number', 'status'],
}

export function placeholdersFor(typeCode: string): readonly string[] {
  return NOTIFICATION_PLACEHOLDERS[typeCode] ?? []
}

/** The names in `{{name}}` that the type does not allow, without repeats. Whitespace inside the braces is ignored. */
export function unknownPlaceholders(typeCode: string, text: string): string[] {
  const allowed = new Set(placeholdersFor(typeCode))
  const used = [...text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(used.filter((name) => !allowed.has(name)))]
}
