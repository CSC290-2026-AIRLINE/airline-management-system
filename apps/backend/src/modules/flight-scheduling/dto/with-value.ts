// A route that names a resource in its path (airports/:iata/fees) sets that field on the body, so the path is the one source of the airport.
// A body that is not an object is passed on unchanged, and the service refuses it as it always did.
export function withValue(body: unknown, key: string, value: string): unknown {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? { ...body, [key]: value } : body
}
