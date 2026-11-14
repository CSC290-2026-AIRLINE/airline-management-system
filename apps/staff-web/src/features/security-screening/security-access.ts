export type SecurityAccess = 'allowed' | 'denied' | 'unauthenticated' | 'error'
type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>

/** Capability lookup does not read screening records or use a browser-provided role. */
export async function loadSecurityAccess(fetchWithAuth: AuthFetch, signal?: AbortSignal): Promise<SecurityAccess> {
  const response = await fetchWithAuth('/api/staff/access', { signal })
  if (response.status === 401) return 'unauthenticated'
  if (response.status === 403) return 'denied'
  if (!response.ok) return 'error'
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !('securityScreening' in body)) return 'error'
  if (body.securityScreening === true) return 'allowed'
  return body.securityScreening === false ? 'denied' : 'error'
}
