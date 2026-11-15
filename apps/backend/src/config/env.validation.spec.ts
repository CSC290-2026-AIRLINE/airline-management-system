import { validateEnv } from './env.validation'

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  PORT: '8080',
  NODE_ENV: 'test',
  ACCESS_TOKEN_SECRET: 'test-secret',
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_DAYS: '30',
  CLERK_SECRET_KEY_CUSTOMER: 'sk_test_customer',
  CLERK_SECRET_KEY_STAFF: 'sk_test_staff',
}

describe('validateEnv', () => {
  it('converts numeric values to numbers', () => {
    const config = validateEnv(validEnv)

    expect(config.PORT).toBe(8080)
    expect(config.ACCESS_TOKEN_TTL_SECONDS).toBe(900)
    expect(config.REFRESH_TOKEN_TTL_DAYS).toBe(30)
  })

  it('throws and lists every missing variable', () => {
    const env = { ...validEnv, ACCESS_TOKEN_SECRET: undefined, CLERK_SECRET_KEY_STAFF: '' }

    expect(() => validateEnv(env)).toThrow('Missing required environment variable(s): ACCESS_TOKEN_SECRET, CLERK_SECRET_KEY_STAFF')
  })

  it('defaults PAYMENT_PROVIDER to fake and needs no Stripe keys', () => {
    const config = validateEnv(validEnv)

    expect(config.PAYMENT_PROVIDER).toBe('fake')
    expect(config.STRIPE_SECRET_KEY).toBe('')
  })

  it('rejects an unknown PAYMENT_PROVIDER', () => {
    expect(() => validateEnv({ ...validEnv, PAYMENT_PROVIDER: 'paypal' })).toThrow('PAYMENT_PROVIDER must be one of: fake, stripe')
  })

  it('needs both Stripe keys when PAYMENT_PROVIDER is stripe', () => {
    expect(() => validateEnv({ ...validEnv, PAYMENT_PROVIDER: 'stripe' })).toThrow(
      'PAYMENT_PROVIDER=stripe needs: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET',
    )
  })

  // TODO(F5-dev): delete these two tests with the PAYMENT_DEV_TOOLS setting before the PR merges.
  it('keeps the payment dev tools off unless they are asked for', () => {
    expect(validateEnv(validEnv).PAYMENT_DEV_TOOLS).toBe(false)
    expect(validateEnv({ ...validEnv, PAYMENT_DEV_TOOLS: 'false' }).PAYMENT_DEV_TOOLS).toBe(false)
    expect(validateEnv({ ...validEnv, PAYMENT_DEV_TOOLS: 'TRUE' }).PAYMENT_DEV_TOOLS).toBe(true)
  })

  it('refuses the payment dev tools in production', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'production', PAYMENT_DEV_TOOLS: 'true' })).toThrow(
      'PAYMENT_DEV_TOOLS must not be on when NODE_ENV is production',
    )
    expect(validateEnv({ ...validEnv, NODE_ENV: 'production' }).PAYMENT_DEV_TOOLS).toBe(false)
  })

  it('refuses a live Stripe key', () => {
    const env = { ...validEnv, PAYMENT_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }

    expect(() => validateEnv(env)).toThrow('STRIPE_SECRET_KEY must be a test-mode key (sk_test_...)')
  })
})
