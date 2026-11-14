import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { RosteringErrorCode, RosteringExceptionFilter, rosteringError, toRosteringErrorBody } from './rostering-error'

describe('toRosteringErrorBody', () => {
  it('keeps a named business error as it was thrown', () => {
    const body = rosteringError(RosteringErrorCode.PAIRING_IN_USE, 'P-101 is part of a published roster.', { pairing: 'P-101' })
    expect(toRosteringErrorBody(new ConflictException(body))).toEqual(body)
  })

  it('gives a plain message a code that follows the status', () => {
    expect(toRosteringErrorBody(new BadRequestException('dateFrom is required'))).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'dateFrom is required' },
    })
    expect(toRosteringErrorBody(new NotFoundException('Base BKK was not found')).error.code).toBe('NOT_FOUND')
    expect(toRosteringErrorBody(new ConflictException('Already published')).error.code).toBe('CONFLICT')
    expect(toRosteringErrorBody(new ForbiddenException('Crew rostering is for staff only')).error.code).toBe('FORBIDDEN')
  })

  it('covers the guard 401, which has Nest default message', () => {
    expect(toRosteringErrorBody(new UnauthorizedException())).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
  })

  it('joins a list of messages and keeps the list in details', () => {
    expect(toRosteringErrorBody(new BadRequestException(['a is required', 'b must be a UUID']))).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'a is required; b must be a UUID',
        details: { messages: ['a is required', 'b must be a UUID'] },
      },
    })
  })
})

describe('RosteringExceptionFilter', () => {
  it('answers with the original status and the error shape', () => {
    const json = jest.fn()
    const status = jest.fn().mockReturnValue({ json })
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) }

    new RosteringExceptionFilter().catch(
      new ConflictException(rosteringError(RosteringErrorCode.ROSTER_HAS_BREAKS, 'close 2 open breaks to publish')),
      host as never,
    )

    expect(status).toHaveBeenCalledWith(409)
    expect(json).toHaveBeenCalledWith({ error: { code: 'ROSTER_HAS_BREAKS', message: 'close 2 open breaks to publish' } })
  })
})
