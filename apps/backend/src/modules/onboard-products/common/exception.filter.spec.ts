// Tests the API error envelope: every exception type maps to the
// spec-mandated { error: { code, message, details? } } shape with the
// right HTTP status. The defaultCodeForStatus map is tested in
// particular because a previous version returned NOT_FOUND for every
// status, which masked a real 401 returned to clients as
// { error: { code: "NOT_FOUND", message: "Unauthorized" } }.

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
    expect(arg.error.code).toBe('VALIDATION_ERROR')
  })

  it('maps a 401 HttpException to UNAUTHORIZED, not NOT_FOUND', () => {
    // Regression: a missing/invalid token used to come out as
    // { error: { code: "NOT_FOUND", message: "Unauthorized" } } which
    // is impossible to distinguish from a real 404.
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    const ex = Object.assign(new Error('Unauthorized'), { getStatus: () => HttpStatus.UNAUTHORIZED })
    filter.catch(ex, host)
    expect(res.status).toHaveBeenCalledWith(401)
    const arg = res.json.mock.calls[0][0]
    expect(arg).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
  })

  it('maps a 403 HttpException to FORBIDDEN', () => {
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    const ex = Object.assign(new Error('Forbidden'), { getStatus: () => HttpStatus.FORBIDDEN })
    filter.catch(ex, host)
    const arg = res.json.mock.calls[0][0]
    expect(arg).toEqual({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
  })

  it('maps a 404 HttpException to NOT_FOUND', () => {
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    const ex = Object.assign(new Error('not here'), { getStatus: () => HttpStatus.NOT_FOUND })
    filter.catch(ex, host)
    const arg = res.json.mock.calls[0][0]
    expect(arg).toEqual({ error: { code: 'NOT_FOUND', message: 'not here' } })
  })

  it('maps a 409 HttpException to CONFLICT', () => {
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    const ex = Object.assign(new Error('dup'), { getStatus: () => HttpStatus.CONFLICT })
    filter.catch(ex, host)
    const arg = res.json.mock.calls[0][0]
    expect(arg).toEqual({ error: { code: 'CONFLICT', message: 'dup' } })
  })

  it('maps an unhandled error to 500 INTERNAL_ERROR, not NOT_FOUND', () => {
    // Regression: the catch-all used to send HTTP 500 with code
    // NOT_FOUND, which masked every 5xx as a 404 on the client.
    const filter = new F12ExceptionFilter()
    const { res, host } = makeHost()
    filter.catch(new Error('kaboom'), host)
    expect(res.status).toHaveBeenCalledWith(500)
    const arg = res.json.mock.calls[0][0]
    expect(arg).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } })
  })

  it('exposes the full set of spec error codes', () => {
    for (const code of [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'VALIDATION_ERROR',
      'CONFLICT',
      'INTERNAL_ERROR',
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
