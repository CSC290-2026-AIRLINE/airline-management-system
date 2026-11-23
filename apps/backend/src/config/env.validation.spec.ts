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

  it('allows local photo storage configuration when all S3 settings are supplied', () => {
    const config = validateEnv({
      ...validEnv,
      S3_ENDPOINT: 'http://localhost:8333',
      S3_ACCESS_KEY: 'local-access-key',
      S3_SECRET_KEY: 'local-secret-key',
    })

    expect(config.S3_ENDPOINT).toBe('http://localhost:8333')
    expect(config.S3_ACCESS_KEY).toBe('local-access-key')
    expect(config.S3_SECRET_KEY).toBe('local-secret-key')
  })

  it('keeps photo storage optional for existing no-photo workflows', () => {
    expect(validateEnv(validEnv).S3_ENDPOINT).toBeUndefined()
  })

  it('rejects partial or invalid S3 configuration', () => {
    expect(() => validateEnv({ ...validEnv, S3_ENDPOINT: 'http://localhost:8333' })).toThrow(
      'S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY must be configured together',
    )
    expect(() => validateEnv({ ...validEnv, S3_ENDPOINT: 'ftp://localhost:8333', S3_ACCESS_KEY: 'a', S3_SECRET_KEY: 'b' })).toThrow(
      'S3_ENDPOINT must be a valid HTTP or HTTPS URL',
    )
  })

  it('throws and lists every missing variable', () => {
    const env = { ...validEnv, ACCESS_TOKEN_SECRET: undefined, CLERK_SECRET_KEY_STAFF: '' }

    expect(() => validateEnv(env)).toThrow('Missing required environment variable(s): ACCESS_TOKEN_SECRET, CLERK_SECRET_KEY_STAFF')
  })
})
