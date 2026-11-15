export interface EnvConfig {
  DATABASE_URL: string
  PORT: number
  NODE_ENV: string
  ACCESS_TOKEN_SECRET: string
  ACCESS_TOKEN_TTL_SECONDS: number
  REFRESH_TOKEN_TTL_DAYS: number
  CLERK_SECRET_KEY_CUSTOMER: string
  CLERK_SECRET_KEY_STAFF: string
  /** Feature 5's payment provider. `fake` (the default) needs no Stripe account or webhook tunnel. */
  PAYMENT_PROVIDER: 'fake' | 'stripe'
  /** Stripe test-mode secret key (`sk_test_...`); required only when PAYMENT_PROVIDER is `stripe`. */
  STRIPE_SECRET_KEY: string
  /** Stripe webhook signing secret (`whsec_...`); required only when PAYMENT_PROVIDER is `stripe`. */
  STRIPE_WEBHOOK_SECRET: string
}

const PAYMENT_PROVIDERS = ['fake', 'stripe'] as const

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'PORT',
  'NODE_ENV',
  'ACCESS_TOKEN_SECRET',
  'ACCESS_TOKEN_TTL_SECONDS',
  'REFRESH_TOKEN_TTL_DAYS',
  'CLERK_SECRET_KEY_CUSTOMER',
  'CLERK_SECRET_KEY_STAFF',
] as const

export function validateEnv(rawConfig: Record<string, string | undefined>): EnvConfig {
  const missing = REQUIRED_KEYS.filter((key) => !rawConfig[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`)
  }

  const paymentProvider = rawConfig.PAYMENT_PROVIDER || 'fake'
  if (!(PAYMENT_PROVIDERS as readonly string[]).includes(paymentProvider)) {
    throw new Error(`PAYMENT_PROVIDER must be one of: ${PAYMENT_PROVIDERS.join(', ')}`)
  }
  if (paymentProvider === 'stripe') {
    const missingStripe = (['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] as const).filter((key) => !rawConfig[key])
    if (missingStripe.length > 0) {
      throw new Error(`PAYMENT_PROVIDER=stripe needs: ${missingStripe.join(', ')}`)
    }
    // Test mode only: a live key must never reach this app.
    if (!String(rawConfig.STRIPE_SECRET_KEY).startsWith('sk_test_')) {
      throw new Error('STRIPE_SECRET_KEY must be a test-mode key (sk_test_...)')
    }
  }

  return {
    DATABASE_URL: String(rawConfig.DATABASE_URL),
    PORT: Number(rawConfig.PORT),
    NODE_ENV: String(rawConfig.NODE_ENV),
    ACCESS_TOKEN_SECRET: String(rawConfig.ACCESS_TOKEN_SECRET),
    ACCESS_TOKEN_TTL_SECONDS: Number(rawConfig.ACCESS_TOKEN_TTL_SECONDS),
    REFRESH_TOKEN_TTL_DAYS: Number(rawConfig.REFRESH_TOKEN_TTL_DAYS),
    CLERK_SECRET_KEY_CUSTOMER: String(rawConfig.CLERK_SECRET_KEY_CUSTOMER),
    CLERK_SECRET_KEY_STAFF: String(rawConfig.CLERK_SECRET_KEY_STAFF),
    PAYMENT_PROVIDER: paymentProvider as EnvConfig['PAYMENT_PROVIDER'],
    STRIPE_SECRET_KEY: rawConfig.STRIPE_SECRET_KEY ?? '',
    STRIPE_WEBHOOK_SECRET: rawConfig.STRIPE_WEBHOOK_SECRET ?? '',
  }
}
