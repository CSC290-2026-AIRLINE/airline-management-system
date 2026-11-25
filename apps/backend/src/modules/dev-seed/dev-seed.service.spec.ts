import { ConflictException } from '@nestjs/common'
import { EventEmitter } from 'node:events'
import { DevSeedService } from './dev-seed.service'

const spawnMock = jest.fn()
jest.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) as unknown }))

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  spawnMock.mockReturnValue(child)
  return child
}

describe('DevSeedService', () => {
  beforeEach(() => spawnMock.mockReset())

  it('starts idle', () => {
    expect(new DevSeedService().status().state).toBe('idle')
  })

  it('runs seed.ts without a shell and records the result', () => {
    const child = fakeChild()
    const service = new DevSeedService()

    expect(service.start().state).toBe('running')
    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      ['tsx', '-r', 'tsconfig-paths/register', 'src/db/seed.ts'],
      expect.not.objectContaining({ shell: true }),
    )
    child.stdout.emit('data', Buffer.from('Generated 5 upcoming pattern flights\n'))
    child.emit('close', 0)

    const status = service.status()
    expect(status.state).toBe('succeeded')
    expect(status.exit_code).toBe(0)
    expect(status.log).toEqual(['Generated 5 upcoming pattern flights'])
  })

  it('refuses a second run while one is going, and records a failure', () => {
    const child = fakeChild()
    const service = new DevSeedService()
    service.start()

    expect(() => service.start()).toThrow(ConflictException)
    child.stderr.emit('data', Buffer.from('boom\n'))
    child.emit('close', 1)

    expect(service.status()).toMatchObject({ state: 'failed', exit_code: 1, log: ['boom'] })
    fakeChild()
    expect(service.start().state).toBe('running')
  })
})
