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
})
