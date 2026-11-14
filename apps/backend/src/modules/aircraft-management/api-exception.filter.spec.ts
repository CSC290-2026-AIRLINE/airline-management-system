import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, type ArgumentsHost } from '@nestjs/common'
import { ApiExceptionFilter } from './api-exception.filter'

function run(exception: Parameters<ApiExceptionFilter['catch']>[0]): { status: number; body: unknown } {
  const result: { status: number; body: unknown } = { status: 0, body: undefined }
  const response = {
    status: (code: number) => {
      result.status = code
      return { json: (body: unknown) => (result.body = body) }
    },
  }
  new ApiExceptionFilter().catch(exception, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost)
  return result
}

describe('ApiExceptionFilter', () => {
  it('answers { error: { code, message } } with the status of the exception', () => {
    expect(run(new NotFoundException('Aircraft with ID x not found'))).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'Aircraft with ID x not found' } },
    })
    expect(run(new ForbiddenException('Only staff'))).toEqual({
      status: 403,
      body: { error: { code: 'forbidden', message: 'Only staff' } },
    })
  })

  it('joins the messages of a validation error and lists them in the details', () => {
    const result = run(new BadRequestException(['code must be a string', 'model must be a string']))

    expect(result.status).toBe(400)
    expect(result.body).toEqual({
      error: {
        code: 'bad_request',
        message: 'code must be a string, model must be a string',
        details: ['code must be a string', 'model must be a string'],
      },
    })
  })

  it('carries the details of a conflict, such as the conflicting period', () => {
    const result = run(new ConflictException({ message: 'The dates overlap', details: { conflicting_period: { id: 'p1' } } }))

    expect(result.body).toEqual({
      error: { code: 'conflict', message: 'The dates overlap', details: { conflicting_period: { id: 'p1' } } },
    })
  })
})
