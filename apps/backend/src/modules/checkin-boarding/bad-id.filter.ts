import { type ArgumentsHost, Catch, Logger } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { Request, Response } from 'express'
import type { ApiError } from './api-types'

/**
 * Every id of the database is a UUID, and Postgres refuses anything else. Without this filter a mistyped or cut link
 * (`/check-ins/abc`) answers 500; it is a thing that does not exist, so it answers 404 like any other unknown id.
 */
@Catch()
export class BadIdFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(BadIdFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const message = (exception as { message?: unknown } | null)?.message
    if (typeof message !== 'string' || !message.includes('invalid input syntax for type uuid')) return super.catch(exception, host)
    // Logged, so that a bug of ours that feeds a bad id into a query does not hide behind the 404.
    const request = host.switchToHttp().getRequest<Request>()
    this.logger.warn(`${request.method} ${request.url}: an id that is no UUID, answered 404`)
    const body: ApiError = { error: { code: 'NOT_FOUND', message: 'Not found' } }
    host.switchToHttp().getResponse<Response>().status(404).json(body)
  }
}
