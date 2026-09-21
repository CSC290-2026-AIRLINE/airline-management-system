export interface AppOriginConfig {
  cookieName: string
  clerkSecretKeyEnvVar: 'CLERK_SECRET_KEY_CUSTOMER' | 'CLERK_SECRET_KEY_STAFF'
}

// Each frontend gets its own refresh-token cookie name AND its own Clerk
// application (hence its own secret key), so two apps open in the same
// browser never share a session, cookie, or Clerk sign-in/sign-out with
// each other, even though they hit one shared backend origin. Also doubles
// as the CORS allow-list (main.ts).
export const APP_ORIGINS: Record<string, AppOriginConfig> = {
  'http://localhost:5151': { cookieName: 'refresh_token_customer', clerkSecretKeyEnvVar: 'CLERK_SECRET_KEY_CUSTOMER' },
  'http://localhost:6161': { cookieName: 'refresh_token_staff', clerkSecretKeyEnvVar: 'CLERK_SECRET_KEY_STAFF' },
}

export function getAppOriginConfig(origin: string | undefined): AppOriginConfig | null {
  return origin ? (APP_ORIGINS[origin] ?? null) : null
}

export function getRefreshCookieName(origin: string | undefined): string | null {
  return getAppOriginConfig(origin)?.cookieName ?? null
}
