export interface EnvConfig {
  DATABASE_URL: string
  PORT: number
  NODE_ENV: string
  ACCESS_TOKEN_SECRET: string
  ACCESS_TOKEN_TTL_SECONDS: number
  REFRESH_TOKEN_TTL_DAYS: number
  CLERK_SECRET_KEY_CUSTOMER: string
  CLERK_SECRET_KEY_STAFF: string
}

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

  return {
    DATABASE_URL: String(rawConfig.DATABASE_URL),
    PORT: Number(rawConfig.PORT),
    NODE_ENV: String(rawConfig.NODE_ENV),
    ACCESS_TOKEN_SECRET: String(rawConfig.ACCESS_TOKEN_SECRET),
    ACCESS_TOKEN_TTL_SECONDS: Number(rawConfig.ACCESS_TOKEN_TTL_SECONDS),
    REFRESH_TOKEN_TTL_DAYS: Number(rawConfig.REFRESH_TOKEN_TTL_DAYS),
    CLERK_SECRET_KEY_CUSTOMER: String(rawConfig.CLERK_SECRET_KEY_CUSTOMER),
    CLERK_SECRET_KEY_STAFF: String(rawConfig.CLERK_SECRET_KEY_STAFF),
  }
}
