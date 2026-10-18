// Small shared delay so each mock API call returns at a believable pace.
// Real pages can swap this for fetchWithAuth from useAppAuth() without changing the call sites.

export const MOCK_LATENCY_MS = 80

export function delay(ms: number = MOCK_LATENCY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
