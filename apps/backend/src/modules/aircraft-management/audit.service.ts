import { Injectable, Logger } from '@nestjs/common'

export interface AuditEntry {
  /** What happened, for example `status_period.created`. */
  action: string
  entity: string
  entity_id: string
  actor_staff_id?: string
  details?: Record<string, unknown>
}

/**
 * Feature 9 sends an audit entry to Feature 15 for status periods, maintenance changes,
 * cancellations and changes to the reserve ratio. Feature 15 has no endpoint yet, so the entry
 * is only logged. When it exists, only this class changes.
 *
 * TODO(F15-integration): Forward audit entries to Feature 15's endpoint once it is available.
 * Steps:
 *  1. Inject Feature 15's AuditClient (HTTP client or shared NestJS module).
 *  2. Replace `this.logger.debug(...)` in `record()` with a non-blocking call to
 *     `auditClient.publish(entry)` — keep the debug log as a fallback on failure.
 *  3. Decide retry/at-least-once guarantees with the Feature 15 team (fire-and-forget vs. queue).
 * Tracking: https://github.com/<org>/<repo>/issues/<F15-ticket>
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  record(entry: AuditEntry): void {
    this.logger.debug(`${entry.action} ${entry.entity} ${entry.entity_id}`)
  }
}
