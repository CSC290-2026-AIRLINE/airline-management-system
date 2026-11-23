export interface EnvConfig {
  DATABASE_URL: string
  PORT: number
  NODE_ENV: string
  ACCESS_TOKEN_SECRET: string
  ACCESS_TOKEN_TTL_SECONDS: number
  REFRESH_TOKEN_TTL_DAYS: number
  CLERK_SECRET_KEY_CUSTOMER: string
  CLERK_SECRET_KEY_STAFF: string
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
