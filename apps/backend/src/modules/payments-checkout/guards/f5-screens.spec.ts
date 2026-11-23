import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { F5_SCREENS } from './f5-screens'

/** Every file under a folder, so the test finds each `@RequireScreen('f5...')` whichever controller holds it. */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}

describe('Feature 5 staff screens', () => {
  it('lists every screen a route asks for, so no module can switch another module’s screen off', () => {
    const modules = join(__dirname, '..', '..')
    const asked = new Set<string>()
    for (const dir of ['payments-checkout', 'payments-refunds']) {
      for (const file of files(join(modules, dir)).filter((f) => f.endsWith('.controller.ts'))) {
        for (const match of readFileSync(file, 'utf8').matchAll(/@RequireScreen\('(f5\.[a-z_]+)'\)/g)) asked.add(match[1])
      }
    }

    expect(asked.size).toBeGreaterThan(0)
    expect(F5_SCREENS.map((screen) => screen.code).sort()).toEqual([...asked].sort())
  })

  it('has no duplicate code and every screen is assignable on feature 5', () => {
    const codes = F5_SCREENS.map((screen) => screen.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(F5_SCREENS.every((screen) => screen.kind === 'assignable' && screen.feature_no === '5')).toBe(true)
  })
})
