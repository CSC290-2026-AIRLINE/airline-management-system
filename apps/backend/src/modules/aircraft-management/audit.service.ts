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
 * Feature 9 sends an audit entry to Feature 15 for status periods, maintenance changes, cancellations and changes to the
 * reserve ratio. Feature 15 has no endpoint yet, so the entry is only logged. When it exists, only this class changes.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  record(entry: AuditEntry): void {
    this.logger.debug(`${entry.action} ${entry.entity} ${entry.entity_id}`)
  }
}
