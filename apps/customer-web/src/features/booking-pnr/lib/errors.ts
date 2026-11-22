import { ApiError } from '../api/client'

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error
  }
  return new ApiError('REQUEST_FAILED', 'The request failed. Please try again.', 0)
}
