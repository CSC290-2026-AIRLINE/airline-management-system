function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
/** F7 envelope, with legacy Nest/auth responses retained during migration. */
export function f7ErrorMessage(body: unknown, fallback: string): string {
  const outer = record(body)
  const error = record(outer?.error) ?? outer
  if (!error) return fallback
  const raw = error.message
  const message =
    typeof raw === 'string' && raw.trim()
      ? raw
      : Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === 'string' && !!item.trim()).join('; ')
        : ''
  const fields = record(error.details)?.fields
  const failures = Array.isArray(fields)
    ? fields.flatMap((item) => {
        const field = record(item)
        return field && typeof field.field === 'string' && typeof field.message === 'string' ? [field.field + ': ' + field.message] : []
      })
    : []
  return failures.length ? failures.join('; ') : message || fallback
}
