import type { ConfigService } from '@nestjs/config'
import type { SeatPaymentService } from './seat-payment.service'
import { DevSeatPaymentController } from './dev-seat-payment.controller'
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))
jest.mock('./seat-payment.service', () => ({ SeatPaymentService: class {} }))
describe('DevSeatPaymentController', () => {
  const confirmForUser = jest.fn()
  const config = { get: jest.fn() }
  const controller = new DevSeatPaymentController({ confirmForUser } as unknown as SeatPaymentService, config as unknown as ConfigService)
  beforeEach(() => jest.resetAllMocks())
  it('does not expose fake seat payment in production', () => {
    config.get.mockReturnValue('production')
    expect(() => controller.confirm({ id: 'user', email: 'test@example.com' }, 'ABC123', 'coupon', 'lock')).toThrow()
    expect(confirmForUser).not.toHaveBeenCalled()
  })
  it('uses the authenticated user for development payment', () => {
    config.get.mockReturnValue('development')
    void controller.confirm({ id: 'user', email: 'test@example.com' }, 'ABC123', 'coupon', 'lock')
    expect(confirmForUser).toHaveBeenCalledWith('ABC123', 'coupon', 'lock', 'user')
  })
})
