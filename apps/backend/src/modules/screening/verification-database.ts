/** Validate configuration before the optional PostgreSQL verification opens a connection. */
export function verificationDatabaseUrl(env: NodeJS.ProcessEnv, args: string[]): string {
  if (!args.includes('--local-database')) throw new Error('Pass --local-database to confirm local verification.')
  if (env.NODE_ENV === 'production') throw new Error('Database verification cannot run in production.')
  if (!env.DATABASE_URL) throw new Error('Provide the local DATABASE_URL through the process environment.')
  let target: URL
  try {
    target = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('DATABASE_URL must be a valid local PostgreSQL URL.')
  }
  const allowedHosts = ['localhost', '127.0.0.1', '[::1]']
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !allowedHosts.includes(target.hostname) || target.pathname.length <= 1)
    throw new Error('Database verification requires a named PostgreSQL database on a loopback host.')
  // pg connection-string query parameters must not override the validated target.
  const routingKeys = ['host', 'hostaddr', 'port', 'database', 'dbname', 'user', 'password', 'service']
  if ([...target.searchParams.keys()].some((key) => routingKeys.includes(key.toLowerCase())))
    throw new Error('Connection target overrides are not accepted by database verification.')
  return env.DATABASE_URL
}
