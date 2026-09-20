import path from 'node:path'
import { defineConfig, env } from 'prisma/config'

try {
  process.loadEnvFile(path.join(__dirname, '.env'))
} catch {
  // .env is optional (e.g. DATABASE_URL provided by the shell/CI)
}

export default defineConfig({
  schema: path.join('src', 'db', 'prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
})
