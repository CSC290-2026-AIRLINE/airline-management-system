import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
import { DbService } from '@backend/db/db.service'
import { BaggageCustomerGuard } from './baggage-customer.guard'

function executionContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('BaggageCustomerGuard', () => {
  it('rejects unauthenticated requests', async () => {
    const findFirst = jest.fn()
    const guard = new BaggageCustomerGuard({ customer: { findFirst } } as unknown as DbService)

    await expect(guard.canActivate(executionContext({}))).rejects.toBeInstanceOf(UnauthorizedException)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it('rejects authenticated users without an active customer account', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const guard = new BaggageCustomerGuard({ customer: { findFirst } } as unknown as DbService)

    await expect(guard.canActivate(executionContext({ user: { id: 'user-1', email: 'customer@example.test' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('resolves customer and passenger identity from the authenticated account', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'customer-1', passenger_id: 'passenger-1' })
    const guard = new BaggageCustomerGuard({ customer: { findFirst } } as unknown as DbService)
    const request: Record<string, unknown> = { user: { id: 'user-1', email: 'customer@example.test' } }

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true)
    expect(request.baggageCustomer).toEqual({
      id: 'user-1',
      email: 'customer@example.test',
      customerId: 'customer-1',
      passengerId: 'passenger-1',
    })
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: 'user-1',
          deleted_at: null,
          user: { type: 'customer', disabled_at: null, deleted_at: null },
        }),
      }),
    )
  })
})
