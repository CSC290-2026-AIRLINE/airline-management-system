import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { BookingError } from './booking-error'

@Catch(BookingError)
export class BookingErrorFilter implements ExceptionFilter {
  catch(exception: BookingError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    response.status(exception.status).json({
      error: {
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      },
    })
  }
}
