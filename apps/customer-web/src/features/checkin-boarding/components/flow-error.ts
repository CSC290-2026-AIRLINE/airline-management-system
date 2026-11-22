import { ApiRequestError } from '../api/client.ts'

export interface FlowError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/** Every failure the UI shows goes through the backend error envelope. */
export function toFlowError(error: unknown): FlowError {
  if (error instanceof ApiRequestError) {
    return { code: error.code, message: error.message, details: error.details }
  }
  return { code: 'UNKNOWN', message: error instanceof Error ? error.message : 'Something went wrong' }
}
