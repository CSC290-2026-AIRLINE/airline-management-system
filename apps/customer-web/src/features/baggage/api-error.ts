/** The F10 error body: `{ error: { code, message, details? } }`, the project-wide shape. */
export interface BaggageApiErrorBody {
  error?: { code?: unknown; message?: unknown; details?: unknown }
}

export interface BaggageApiErrorInfo {
  code: string | null
  message: string | null
}

/** Reads the code and message from an error body; anything malformed gives nulls, so the caller's fallback is shown. */
export function readBaggageApiError(body: unknown): BaggageApiErrorInfo {
  const error = typeof body === 'object' && body !== null ? (body as BaggageApiErrorBody).error : undefined
  if (typeof error !== 'object' || error === null) return { code: null, message: null }
  return {
    code: typeof error.code === 'string' && error.code ? error.code : null,
    message: typeof error.message === 'string' && error.message ? error.message : null,
  }
}
