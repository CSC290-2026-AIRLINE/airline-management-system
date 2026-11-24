import { Logger } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { CustomerServiceService, NotificationService } from '@backend/modules/customer-service'
import { BaggageCaseNotices } from './baggage-case-notices'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests pass a mock `db` instead.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@backend/modules/customer-service', () => ({ CustomerServiceService: class {}, NotificationService: class {} }))

const REPORT_ID = '77777777-7777-7777-7777-777777777777'
const REPORT = {
  case_number: 'LB-2026-000009',
  contact_email: 'pax@example.com',
  contact_phone: null,
  passenger: { first_name: 'Ann', last_name: 'Lee', customer: { id: 'cust-1', phone: '+66812345678' } },
}

describe('BaggageCaseNotices', () => {
  const db = { lost_bag_report: { findUnique: jest.fn() } }
  const notifications = { handleEvent: jest.fn() }
  const customerService = { openLostBagCase: jest.fn() }
  let notices: BaggageCaseNotices

  beforeEach(() => {
    jest.resetAllMocks()
    db.lost_bag_report.findUnique.mockResolvedValue(REPORT)
    notifications.handleEvent.mockResolvedValue({ ignored: false })
    notices = new BaggageCaseNotices(
      db as unknown as DbService,
      notifications as unknown as NotificationService,
      customerService as unknown as CustomerServiceService,
    )
  })

  it('sends a status change as bag_case_updated to the passenger', async () => {
    await notices.send({ event: 'matched', reportId: REPORT_ID })

    expect(notifications.handleEvent).toHaveBeenCalledWith({
      source: '10',
      sourceEventId: `matched:${REPORT_ID}`,
      eventType: 'bag_case_updated',
      payload: { case_number: 'LB-2026-000009', status: expect.stringContaining('matched') },
      recipients: [{ passengerName: 'Ann Lee', email: 'pax@example.com', phone: '+66812345678', customerId: 'cust-1' }],
    })
    expect(customerService.openLostBagCase).not.toHaveBeenCalled()
  })

  it('sends a delivery step as bag_delivery_updated, one event per step', async () => {
    await notices.send({ event: 'delivering', reportId: REPORT_ID, detail: 'ready_for_pickup' })

    expect(notifications.handleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEventId: `delivering:${REPORT_ID}:ready_for_pickup`,
        eventType: 'bag_delivery_updated',
        payload: { case_number: 'LB-2026-000009', delivery_status: 'Ready for pickup' },
      }),
    )
  })

  it('opens the compensation case for a lost report, then tells the passenger', async () => {
    await notices.send({ event: 'lost', reportId: REPORT_ID })

    expect(customerService.openLostBagCase).toHaveBeenCalledWith(REPORT_ID)
    expect(notifications.handleEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'bag_case_updated' }))
  })

  it('never throws from notify when Feature 13 fails', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    notifications.handleEvent.mockRejectedValue(new Error('down'))

    expect(() => notices.notify([{ event: 'closed', reportId: REPORT_ID }])).not.toThrow()
    await new Promise((resolve) => setImmediate(resolve))
    expect(error).toHaveBeenCalled()
  })

  it('only logs when built without Feature 13', async () => {
    await expect(new BaggageCaseNotices().send({ event: 'closed', reportId: REPORT_ID })).resolves.toBeUndefined()
  })
})
