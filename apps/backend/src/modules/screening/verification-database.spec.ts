import { verificationDatabaseUrl } from './verification-database'

const args = ['--local-database']
// Synthetic connection values only; these tests never connect to PostgreSQL.
const local = 'postgresql://test-user:example-only@localhost:5432/verification_test'
describe('PostgreSQL verification configuration', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('accepts an explicitly confirmed local target at %s', (host) => {
    const DATABASE_URL = local.replace('localhost', host)
    expect(verificationDatabaseUrl({ DATABASE_URL }, args)).toBe(DATABASE_URL)
  })
  it('rejects a missing URL instead of using embedded defaults', () => {
    expect(() => verificationDatabaseUrl({}, args)).toThrow('process environment')
  })
  it('requires explicit local confirmation', () => {
    expect(() => verificationDatabaseUrl({ DATABASE_URL: local }, [])).toThrow('--local-database')
  })
  it('rejects production even on localhost', () => {
    expect(() => verificationDatabaseUrl({ DATABASE_URL: local, NODE_ENV: 'production' }, args)).toThrow('production')
  })
  it.each([
    'not-a-url',
    'https://localhost/test',
    'postgresql://remote.example/test',
    'postgresql://localhost.attacker.example/test',
    'postgresql://localhost/',
  ])('rejects unsuitable targets without disclosing their values', (DATABASE_URL) => {
    expect(() => verificationDatabaseUrl({ DATABASE_URL }, args)).toThrow()
    try {
      verificationDatabaseUrl({ DATABASE_URL }, args)
    } catch (error) {
      expect((error as Error).message).not.toContain(DATABASE_URL)
    }
  })
  it.each(['host', 'hostaddr', 'port', 'database', 'dbname', 'user', 'password', 'service', 'HOST'])(
    'rejects a %s query override',
    (key) => {
      expect(() => verificationDatabaseUrl({ DATABASE_URL: local + '?' + key + '=remote.example' }, args)).toThrow('overrides')
    },
  )
  it('does not include credentials in invalid-target errors', () => {
    expect(() => verificationDatabaseUrl({ DATABASE_URL: local.replace('localhost', 'remote.example') }, args)).toThrow('loopback')
    try {
      verificationDatabaseUrl({ DATABASE_URL: local.replace('localhost', 'remote.example') }, args)
    } catch (error) {
      expect((error as Error).message).not.toMatch(/test-user|example-only/)
    }
  })
})
