import { AuditService } from '../../admin-console/audit/audit.service'
import { AuditServiceSink } from './audit-sink'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('AuditServiceSink', () => {
  const tx = { staff: { findUniqueOrThrow: jest.fn() } }
  const audit = { write: jest.fn() }
  const sink = new AuditServiceSink(audit as unknown as AuditService)
  const entry = {
    action: 'schedule_conflict.dismissed' as const,
    entityId: 'c1',
    actorId: 'staff-1',
    reason: 'Handled by phone',
    occurredAt: new Date('2026-11-02T06:00:00Z'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    tx.staff.findUniqueOrThrow.mockResolvedValue({ user_id: 'user-1', role: { code: 'admin' } })
  })

  it('writes a status_change for the conflict, as the staff member’s user, on the same transaction', async () => {
    await sink.record(entry, tx as never)

    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'staff', id: 'user-1', role: 'admin' },
        sourceFeature: '2',
        action: 'status_change',
        entityType: 'schedule_conflict',
        entityId: 'c1',
        reason: 'Handled by phone',
        before: { status: 'open' },
        after: { status: 'dismissed' },
        occurredAt: entry.occurredAt,
      }),
      tx,
    )
  })

  it('lets a failed write through, so the caller’s transaction rolls back', async () => {
    audit.write.mockRejectedValue(new Error('db down'))
    await expect(sink.record(entry, tx as never)).rejects.toThrow('db down')
  })
})
