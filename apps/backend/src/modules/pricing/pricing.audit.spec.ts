import type { Prisma } from '@backend/db/generated/prisma/client'
import type { AuditService } from '../admin-console/audit/audit.service'
import { PricingAudit } from './pricing.audit'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('PricingAudit', () => {
  const auditService = { resolveActor: jest.fn(), write: jest.fn() }
  const tx = {} as Prisma.TransactionClient
  let pricingAudit: PricingAudit

  beforeEach(() => {
    jest.resetAllMocks()
    pricingAudit = new PricingAudit(auditService as unknown as AuditService)
  })

  it('writes the entry as feature 4, for the resolved actor, inside the given transaction', async () => {
    const actor = { type: 'staff', id: 'user-1', role: 'admin' }
    auditService.resolveActor.mockResolvedValue(actor)

    await pricingAudit.write('user-1', { action: 'create', entityType: 'tax_fee', entityId: 'tf-1', summary: 'Created tax/fee VAT' }, tx)

    expect(auditService.resolveActor).toHaveBeenCalledWith('user-1')
    expect(auditService.write).toHaveBeenCalledWith(
      { actor, sourceFeature: '4', action: 'create', entityType: 'tax_fee', entityId: 'tf-1', summary: 'Created tax/fee VAT' },
      tx,
    )
  })

  it('records a change with no user as the system', async () => {
    const system = { type: 'system', id: null, role: null }
    auditService.resolveActor.mockResolvedValue(system)

    await pricingAudit.write(null, { action: 'update', entityType: 'promo_redemption', entityId: 'r1', summary: 'Released' }, tx)

    expect(auditService.resolveActor).toHaveBeenCalledWith(null)
    expect(auditService.write).toHaveBeenCalledWith(expect.objectContaining({ actor: system, sourceFeature: '4' }), tx)
  })
})
