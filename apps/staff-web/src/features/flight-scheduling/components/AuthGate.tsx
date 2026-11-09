import { useState, type ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'

// AppAuthProvider gets the access token after Clerk loads. A page that mounts earlier sends its first requests without a token and
// they return 401, and nothing asks again. So render the page only once the first sign-in exchange has finished (kept after that, so a
// later token refresh does not remount the page).
// ponytail: lives in this feature until AuthenticatedLayout waits for the token itself.
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading } = useAppAuth()
  const [ready, setReady] = useState(false)
  if (!isLoading && !ready) setReady(true)
  return ready || !isLoading ? children : null
}
