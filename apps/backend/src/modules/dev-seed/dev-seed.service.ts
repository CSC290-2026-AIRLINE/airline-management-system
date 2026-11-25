import { ConflictException, Injectable, Logger } from '@nestjs/common'
import { spawn } from 'node:child_process'

export type DevSeedState = 'idle' | 'running' | 'succeeded' | 'failed'

export interface DevSeedStatus {
  state: DevSeedState
  started_at: string | null
  finished_at: string | null
  exit_code: number | null
  /** The last lines the seed printed. */
  log: string[]
}

const LOG_LINES = 60

/**
 * Runs `src/db/seed.ts` exactly as `npm run db:seed` does, in a child process, so the seed script stays the single source of
 * the demo data. One run at a time; the seed is safe to rerun.
 */
@Injectable()
export class DevSeedService {
  private readonly logger = new Logger(DevSeedService.name)
  private current: DevSeedStatus = { state: 'idle', started_at: null, finished_at: null, exit_code: null, log: [] }

  status(): DevSeedStatus {
    return { ...this.current, log: [...this.current.log] }
  }

  start(): DevSeedStatus {
    if (this.current.state === 'running') throw new ConflictException('The seed is already running')
    this.current = { state: 'running', started_at: new Date().toISOString(), finished_at: null, exit_code: null, log: [] }

    // No shell, fixed arguments: nothing from the request reaches the command line.
    const child = spawn('npx', ['tsx', '-r', 'tsconfig-paths/register', 'src/db/seed.ts'], { cwd: process.cwd(), env: process.env })
    const keep = (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      this.current.log = [...this.current.log, ...lines].slice(-LOG_LINES)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    child.on('error', (error) => this.finish(null, `Could not start the seed: ${error.message}`))
    child.on('close', (code) => this.finish(code))
    this.logger.warn('Seeding the database from src/db/seed.ts (DEV_SEED_ENABLED)')
    return this.status()
  }

  private finish(code: number | null, note?: string): void {
    if (this.current.state !== 'running') return
    this.current = {
      ...this.current,
      state: code === 0 ? 'succeeded' : 'failed',
      finished_at: new Date().toISOString(),
      exit_code: code,
      log: note ? [...this.current.log, note].slice(-LOG_LINES) : this.current.log,
    }
    this.logger.log(`Seed ${this.current.state}`)
  }
}
