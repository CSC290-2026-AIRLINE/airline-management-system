import { createHash } from 'node:crypto'

/**
 * A UUID that is always the same for the same parts, for `AuditWriteInput.id`: e.g.
 * `stableAuditId('sign_in', clerkSessionId)`. Shaped as a version-5 (name-based, SHA-1) UUID.
 */
export function stableAuditId(...parts: string[]): string {
  const bytes = createHash('sha1')
    .update(`audit_log:${parts.join('\u0000')}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
