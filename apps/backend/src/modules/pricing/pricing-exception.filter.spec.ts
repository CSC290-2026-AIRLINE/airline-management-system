import { ArgumentsHost, BadRequestException, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { PricingErrorCode, pricingError } from './pricing.errors'
import { PricingExceptionFilter, toPricingErrorBody } from './pricing-exception.filter'

function hostFor(json: jest.Mock, status: jest.Mock): ArgumentsHost {
  status.mockReturnValue({ json })
  return { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost
}

describe('toPricingErrorBody', () => {
  it('wraps a pricingError body, keeping its details', () => {
    const body = pricingError(PricingErrorCode.PROMO_INVALID, 'Expired', { reason: 'expired' })

    expect(toPricingErrorBody(body, 422)).toEqual({ error: { code: 'PROMO_INVALID', message: 'Expired', details: { reason: 'expired' } } })
  })

  it('leaves details out when there are none', () => {
    expect(toPricingErrorBody(pricingError(PricingErrorCode.QUOTE_NOT_FOUND, 'Gone'), 404)).toEqual({
      error: { code: 'QUOTE_NOT_FOUND', message: 'Gone' },
    })
  })

  it('turns ValidationPipe messages into VALIDATION_FAILED with the list in details', async () => {
    const pipe = new ValidationPipe({ forbidNonWhitelisted: true, whitelist: true })
    class Dto {}
    const error = (await pipe.transform({ extra: 1 }, { type: 'body', metatype: Dto }).catch((e: unknown) => e)) as BadRequestException

    expect(toPricingErrorBody(error.getResponse(), 400)).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'property extra should not exist',
        details: { errors: ['property extra should not exist'] },
      },
    })
  })

  it('joins several validation messages', () => {
    const error = new BadRequestException(['amount must be a number', 'code should not be empty'])

    expect(toPricingErrorBody(error.getResponse(), 400)).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'amount must be a number; code should not be empty',
        details: { errors: ['amount must be a number', 'code should not be empty'] },
      },
    })
  })

  it('uses the status name for other Nest errors', () => {
    expect(toPricingErrorBody(new UnauthorizedException().getResponse(), 401)).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    })
    expect(toPricingErrorBody('plain text', 404)).toEqual({ error: { code: 'NOT_FOUND', message: 'plain text' } })
  })
})

describe('PricingExceptionFilter', () => {
  const filter = new PricingExceptionFilter()

  it('sends the status and the wrapped body', () => {
    const json = jest.fn()
    const status = jest.fn()

    filter.catch(new NotFoundException(pricingError(PricingErrorCode.FARE_CLASS_NOT_FOUND, 'No class')), hostFor(json, status))

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ error: { code: 'FARE_CLASS_NOT_FOUND', message: 'No class' } })
  })

  it('hides the text of an unexpected error behind a 500', () => {
    const json = jest.fn()
    const status = jest.fn()
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined)

    filter.catch(new Error('connection refused at 10.0.0.5'), hostFor(json, status))

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
  })
})
