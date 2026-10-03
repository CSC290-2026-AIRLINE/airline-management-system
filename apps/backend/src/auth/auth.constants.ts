export interface AppOriginConfig {
  cookieName: string
  clerkSecretKeyEnvVar: 'CLERK_SECRET_KEY_CUSTOMER' | 'CLERK_SECRET_KEY_STAFF'
  userType: 'customer' | 'staff'
}

// Each frontend gets its own refresh-token cookie name AND its own Clerk
// application (hence its own secret key), so two apps open in the same
// browser never share a session, cookie, or Clerk sign-in/sign-out with
// each other, even though they hit one shared backend origin. Also doubles
// as the CORS allow-list (main.ts).
//
// Origins are read from CUSTOMER_WEB_ORIGIN / STAFF_WEB_ORIGIN so production
// can point at the real deployed frontend URLs instead of localhost. Both
// fall back to the local dev ports when unset.
export const APP_ORIGINS: Record<string, AppOriginConfig> = {
  [process.env.CUSTOMER_WEB_ORIGIN ?? 'http://localhost:5151']: {
    cookieName: 'refresh_token_customer',
    clerkSecretKeyEnvVar: 'CLERK_SECRET_KEY_CUSTOMER',
    userType: 'customer',
  },
  [process.env.STAFF_WEB_ORIGIN ?? 'http://localhost:6161']: {
    cookieName: 'refresh_token_staff',
    clerkSecretKeyEnvVar: 'CLERK_SECRET_KEY_STAFF',
    userType: 'staff',
  },
}

export function getAppOriginConfig(origin: string | undefined): AppOriginConfig | null {
  return origin ? (APP_ORIGINS[origin] ?? null) : null
}

export function getRefreshCookieName(origin: string | undefined): string | null {
  return getAppOriginConfig(origin)?.cookieName ?? null
}
