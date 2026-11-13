import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  ValidationPipe,
  type ExceptionFilter,
  type ValidationPipeOptions,
} from '@nestjs/common'
import type { Response } from 'express'
import type { ValidationError } from 'class-validator'

export interface FieldFailure {
  field: string
  message: string
}
export function invalidField(field: string, message: string) {
  return new BadRequestException({ message: 'Invalid request data', details: { fields: [{ field, message }] } })
}
function validationFields(errors: ValidationError[], parent = ''): FieldFailure[] {
  return errors.flatMap((error) => {
    const field = parent ? parent + '.' + error.property : error.property
    return [
      ...Object.values(error.constraints ?? {}).map((message) => ({ field, message })),
      ...validationFields(error.children ?? [], field),
    ]
  })
}
// F7 only: preserve each controller's validation policy and retain field names,
// without serializing DTO targets, input values or exception internals.
export class F7ValidationPipe extends ValidationPipe {
  constructor(options: ValidationPipeOptions) {
    super({
      ...options,
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new BadRequestException({ message: 'Invalid request data', details: { fields: validationFields(errors) } }),
    })
  }
}
const codes: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
}
@Catch()
export class F7ExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    let message = status >= 500 ? 'The operation could not be completed. Please try again.' : 'The request could not be completed.'
    let details: { fields: FieldFailure[] } | undefined
    if (exception instanceof HttpException && status < 500) {
      const body = exception.getResponse()
      if (typeof body === 'string') message = body
      else {
        const value = body as { message?: unknown; details?: { fields?: unknown } }
        if (typeof value.message === 'string') message = value.message
        else if (Array.isArray(value.message)) message = value.message.filter((item): item is string => typeof item === 'string').join('; ')
        if ((status === 400 || status === 422) && Array.isArray(value.details?.fields)) {
          const fields = value.details.fields
            .filter(
              (item): item is FieldFailure =>
                !!item &&
                typeof item === 'object' &&
                'field' in item &&
                typeof item.field === 'string' &&
                'message' in item &&
                typeof item.message === 'string',
            )
            .map(({ field, message }) => ({ field, message }))
          if (fields.length) details = { fields }
        }
      }
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({
        error: { code: codes[status] ?? 'INTERNAL_ERROR', message, ...(details ? { details } : {}) },
      })
  }
}
