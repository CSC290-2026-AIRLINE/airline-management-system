import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'

export interface PricingErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> }
}

// Turns whatever a pricing route threw into the spec's body: { error: { code, message, details? } }.
// - pricingError() bodies keep their code, message and details.
// - ValidationPipe errors (message: string[]) become VALIDATION_FAILED, with the list in details.errors.
// - Anything else from Nest (401 from the guard, ParseUUIDPipe's 400, ...) gets the status name as its code.
export function toPricingErrorBody(response: string | object, status: number): PricingErrorBody {
  const fallback = (HttpStatus[status] as string | undefined) ?? 'ERROR'
  if (typeof response === 'string') return { error: { code: fallback, message: response } }

  const body = response as { code?: unknown; message?: unknown; details?: unknown }
  if (typeof body.code === 'string') {
    return {
      error: {
        code: body.code,
        message: typeof body.message === 'string' ? body.message : fallback,
        ...(body.details !== undefined && { details: body.details as Record<string, unknown> }),
      },
    }
  }
  if (Array.isArray(body.message)) {
    return { error: { code: 'VALIDATION_FAILED', message: body.message.join('; '), details: { errors: body.message } } }
  }
  return { error: { code: fallback, message: typeof body.message === 'string' ? body.message : fallback } }
}

interface JsonResponse {
  status(code: number): { json(body: unknown): void }
}

@Catch()
export class PricingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PricingExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<JsonResponse>()
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      res.status(status).json(toPricingErrorBody(exception.getResponse(), status))
      return
    }
    // Not a Nest exception: a bug or the database being down. Log it, but never send its text to the caller.
    this.logger.error(exception instanceof Error ? exception.stack : String(exception))
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
  }
}
