// Tests the API error envelope: every exception type maps to the
// spec-mandated { error: { code, message, details? } } shape with the
// right HTTP status.

import { ApiErrorException, F12_ERROR_CODES } from './api-error'
import { F12ExceptionFilter } from './exception.filter'
import { HttpStatus } from '@nestjs/common'
import type { ArgumentsHost } from '@nestjs/common'

// The generated Prisma client uses ESM `.js` specifiers that Jest cannot
// resolve; the filter only needs Prisma.PrismaClientKnownRequestError to
// narrow `instanceof`, so we stub it.
jest.mock('../../../db/generated/prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    constructor(
      message: string,
      readonly meta: { code: string },
    ) {
      super(message)
    }
    get code() {
      return this.meta.code
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } }
})

function makeHost(): { res: { status: jest.Mock; json: jest.Mock }; host: ArgumentsHost } {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  return { res, host: { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({}) }) } as unknown as ArgumentsHost }
}

describe('F12ExceptionFilter', () => {
  it('passes ApiErrorException through unchanged', () => {
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    const ex = new ApiErrorException('REPORT_MISMATCH', 'too many meals', 409, { productId: 'p-1' })
    filter.catch(ex, host)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'REPORT_MISMATCH', message: 'too many meals', details: { productId: 'p-1' } },
    })
  })

  it('omits the details field when not provided', () => {
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    filter.catch(new ApiErrorException('NOT_FOUND', 'gone', 404), host)
    const arg = res.json.mock.calls[0][0]
    expect(arg).toEqual({ error: { code: 'NOT_FOUND', message: 'gone' } })
  })

  it('translates generic HttpException to a default code by status', () => {
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    const ex = Object.assign(new Error('nope'), { getStatus: () => HttpStatus.BAD_REQUEST })
    filter.catch(ex, host)
    const arg = res.json.mock.calls[0][0]
    expect(arg.error.code).toBe('LINE_INVALID')
  })

  it('exposes the full set of spec error codes', () => {
    for (const code of [
      'REPORT_MISMATCH',
      'REPORT_ALREADY_SUBMITTED',
      'REPORT_INVALID',
      'PRODUCT_NOT_OFFERED',
      'BATCH_EXPIRED',
      'STOCK_SHORTFALL',
      'WAREHOUSE_DUPLICATE',
      'CATERING_VOID',
      'IMAGE_INVALID',
      'PRODUCT_IN_USE',
      'NO_WAREHOUSE_FOR_AIRPORT',
    ]) {
      expect(F12_ERROR_CODES).toContain(code)
    }
  })
})
