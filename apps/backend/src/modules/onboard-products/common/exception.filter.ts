// F12-scoped error filter. Translates anything an F12 controller or
// its service throws (an ApiErrorException, a Nest HttpException, or
// a Prisma known error) into the spec-mandated
// { error: { code, message, details? } } envelope. The HTTP status
// is preserved from the original exception; only the code is
// defaulted when the caller threw a generic HttpException.
//
// This filter is NOT registered globally. It is applied per-controller
// via @StaffAuth (the F12 composite decorator), so non-F12 modules
// keep Nest's default error shape.

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Prisma } from '../../../db/generated/prisma/client'
import { ApiErrorException, type F12ErrorCode } from './api-error'

@Catch()
export class F12ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(F12ExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request>()

    if (exception instanceof ApiErrorException) {
      const body = exception.getResponse() as { error: { code: F12ErrorCode; message: string; details?: Record<string, unknown> } }
      res.status(exception.getStatus()).json(body)
      return
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      const message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? 'Request failed.')
      res.status(status).json({ error: { code: defaultCodeForStatus(status), message } })
      return
    }

    // Duck-typed HTTP error (e.g. when a test hands us a plain Error
    // with a getStatus method). Map by status the same way.
    if (typeof (exception as { getStatus?: () => number }).getStatus === 'function') {
      const status = (exception as { getStatus: () => number }).getStatus()
      const message = exception instanceof Error ? exception.message : 'Request failed.'
      res.status(status).json({ error: { code: defaultCodeForStatus(status), message } })
      return
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status = mapPrismaStatus(exception.code)
      const code: F12ErrorCode = status === HttpStatus.CONFLICT ? 'CONFLICT' : 'VALIDATION_ERROR'
      res.status(status).json({
        error: {
          code,
          message: prismaMessage(exception),
        },
      })
      return
    }

    this.logger.error(`Unhandled error on ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception))
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
    })
  }
}

function defaultCodeForStatus(status: number): F12ErrorCode {
  /* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED'
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN'
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND'
  if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_ERROR'
  if (status === HttpStatus.CONFLICT) return 'CONFLICT'
  /* eslint-enable @typescript-eslint/no-unsafe-enum-comparison */
  return 'INTERNAL_ERROR'
}

function mapPrismaStatus(code: string): HttpStatus {
  if (code === 'P2002') return HttpStatus.CONFLICT
  if (code === 'P2025') return HttpStatus.NOT_FOUND
  return HttpStatus.BAD_REQUEST
}

function prismaMessage(exception: Prisma.PrismaClientKnownRequestError): string {
  if (exception.code === 'P2002') {
    const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'field'
    return `Duplicate value for ${target}.`
  }
  if (exception.code === 'P2025') return 'Record not found.'
  return exception.message.split('\n').pop() ?? 'Database error.'
}
