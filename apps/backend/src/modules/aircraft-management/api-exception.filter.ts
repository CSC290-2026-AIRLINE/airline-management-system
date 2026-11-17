import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'

const ERROR_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
}

interface JsonResponse {
  status: (code: number) => { json: (body: unknown) => void }
}

/**
 * Every route of this feature answers an error as `{ error: { code, message, details? } }`, as the requirement document
 * asks. A validation error lists its messages in `details`; a conflict with a status period carries that period.
 */
@Catch(HttpException)
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>()
    const status = exception.getStatus()
    const body = exception.getResponse()

    let message = exception.message
    let details: unknown
    if (typeof body === 'string') {
      message = body
    } else if (typeof body === 'object' && body !== null) {
      const parsed = body as { message?: string | string[]; details?: unknown }
      if (Array.isArray(parsed.message)) {
        message = parsed.message.join(', ')
        details = parsed.message
      } else if (typeof parsed.message === 'string') {
        message = parsed.message
      }
      if (parsed.details !== undefined) {
        details = parsed.details
      }
    }

    response
      .status(status)
      .json({ error: { code: ERROR_CODES[status] ?? 'error', message, ...(details === undefined ? {} : { details }) } })
  }
}
