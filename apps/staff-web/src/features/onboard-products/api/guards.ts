// API-layer guards. The F12 staff-web was being hit with URLs like
// `GET /api/staff/aircraft-stock/undefined` because the page pulled a
// `String(undefined)` and concatenated it into a path. Every api
// function with an id in the path calls `requireId` first, so a
// missing or non-UUID id never reaches the network.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class MissingIdError extends Error {
  readonly where: string
  readonly field: string
  constructor(where: string, field: string) {
    super(`Missing or invalid id for ${where} (field ${field}); refusing to call the API.`)
    this.name = 'MissingIdError'
    this.where = where
    this.field = field
  }
}

/**
 * Throw `MissingIdError` when the value isn't a usable id. Returns the
 * same string on success. The error is caught by the api function and
 * converted into a safe empty result so the page never makes a network
 * call with a bad id.
 */
export function requireId(where: string, field: string, value: unknown): string {
  if (typeof value !== 'string' || value === '' || value === 'undefined' || value === 'null' || !UUID_RE.test(value)) {
    throw new MissingIdError(where, field)
  }
  return value
}
