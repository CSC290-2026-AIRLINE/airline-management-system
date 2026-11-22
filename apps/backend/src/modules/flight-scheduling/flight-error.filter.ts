import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common'
import type { Response } from 'express'

// Iteration-03: errors share one shape across the project, { error: { code, message, details? } }. `details` carries the
// failing rule (for example `violations`) or the list of field problems. Applied to this module's controllers only; unknown
// (non-HTTP) errors are left to Nest's default 500 handling.

const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable',
  502: 'upstream_unavailable',
}

export function toErrorBody(status: number, response: string | object) {
  const code = CODES[status] ?? (status >= 500 ? 'server_error' : 'error')
  if (typeof response === 'string') return { error: { code, message: response } }

  const { message, ...rest } = response as Record<string, unknown>
  // Nest's own `error` (status name) and `statusCode` repeat the code, so they are not details.
  const details: Record<string, unknown> = { ...rest }
  delete details.error
  delete details.statusCode
  let text: string
  if (Array.isArray(message)) {
    text = message.map(String).join('; ')
    details.problems = message
  } else {
    text = typeof message === 'string' ? message : 'Error'
  }
  return { error: { code, message: text, ...(Object.keys(details).length ? { details } : {}) } }
}

@Catch(HttpException)
export class FlightErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus()
    host.switchToHttp().getResponse<Response>().status(status).json(toErrorBody(status, exception.getResponse()))
  }
}
