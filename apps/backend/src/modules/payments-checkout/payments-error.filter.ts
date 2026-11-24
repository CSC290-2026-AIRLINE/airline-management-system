import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common'
import type { Response } from 'express'

/**
 * Feature 5's error body is `{ error: { code, message, details? } }`, as in the rest of the project. The body also keeps
 * Nest's own `statusCode` and a top-level `message`, because the two web apps read `message` today; `error.code` is what
 * a caller should switch on.
 *
 * A failure that already carries a code (`paymentFailure`, `paymentError`) keeps it. Any other HTTP error gets the code of
 * its status. Unknown (non-HTTP) errors are left to Nest's default 500 handling.
 */
const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  502: 'PROVIDER_UNAVAILABLE',
  503: 'PROVIDER_UNAVAILABLE',
}

export function toPaymentErrorBody(status: number, response: string | object): Record<string, unknown> {
  const code = STATUS_CODES[status] ?? (status >= 500 ? 'SERVER_ERROR' : 'ERROR')
  if (typeof response === 'string') return { statusCode: status, message: response, error: { code, message: response } }

  const body = response as { message?: unknown; error?: unknown; [key: string]: unknown }
  const own = body.error && typeof body.error === 'object' ? (body.error as { code?: string; message?: string; details?: unknown }) : null
  if (own?.code) {
    const message = own.message ?? (typeof body.message === 'string' ? body.message : 'Error')
    return { statusCode: status, message, error: { ...own, message } }
  }
  // Validation pipes answer with a list of messages: keep the list as details and join it for the text.
  const list = Array.isArray(body.message) ? body.message.map(String) : null
  const message = list ? list.join('; ') : typeof body.message === 'string' ? body.message : 'Error'
  return {
    statusCode: status,
    message: list ?? message,
    error: { code, message, ...(list ? { details: { problems: list } } : {}) },
  }
}

@Catch(HttpException)
export class PaymentsErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const status = exception.getStatus()
    host.switchToHttp().getResponse<Response>().status(status).json(toPaymentErrorBody(status, exception.getResponse()))
  }
}
