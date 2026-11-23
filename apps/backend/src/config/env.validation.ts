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
  /**
   * Feature 5's development test tools: a payment sandbox and sample crew data (`modules/payments-dev-tools`). Off by
   * default, and refused when NODE_ENV is `production`.
   * TODO(F5-dev): delete this setting with the dev tools before the PR merges.
   */
  PAYMENT_DEV_TOOLS: boolean
  // Optional. When set, every F12 timestamp uses this fixed point in
  // time so the seed data (relative to "now") is deterministic across
  // runs. The /api/staff routes read this via SystemClock.
  SIMULATION_NOW_ISO?: string
  // Optional. The F12 scheduled job (catering order generation, order
  // expiry, batch write-off). Set F12_SCHEDULER_ENABLED to "false" to
  // switch it off; the interval is in seconds.
  F12_SCHEDULER_ENABLED?: boolean
  F12_SCHEDULER_INTERVAL_SECONDS?: number
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

  const devTools = String(rawConfig.PAYMENT_DEV_TOOLS ?? '').toLowerCase() === 'true'
  if (devTools && rawConfig.NODE_ENV === 'production') {
    throw new Error('PAYMENT_DEV_TOOLS must not be on when NODE_ENV is production')
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
    PAYMENT_DEV_TOOLS: devTools,
    SIMULATION_NOW_ISO: rawConfig.SIMULATION_NOW_ISO ? String(rawConfig.SIMULATION_NOW_ISO) : undefined,
    F12_SCHEDULER_ENABLED: parseBoolean(rawConfig.F12_SCHEDULER_ENABLED),
    F12_SCHEDULER_INTERVAL_SECONDS: parsePositiveNumber(rawConfig.F12_SCHEDULER_INTERVAL_SECONDS),
  }
}

// An optional boolean: absent means "the default".
function parseBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw === '') return undefined
  return raw !== 'false' && raw !== '0'
}

// An optional positive number: absent or invalid means "the default".
function parsePositiveNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}
