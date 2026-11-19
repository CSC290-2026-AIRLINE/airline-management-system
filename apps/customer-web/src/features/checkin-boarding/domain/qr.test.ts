import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qrModules } from './qr.ts'

/** The three finder patterns of a QR: a 7x7 ring with a 3x3 core, a light separator around it. */
function finderAt(modules: boolean[][], row: number, col: number): boolean {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const edge = r === 0 || c === 0 || r === 6 || c === 6
      const core = r > 1 && r < 5 && c > 1 && c < 5
      if (modules[row + r][col + c] !== (edge || core)) return false
    }
  }
  return true
}

test('a 10 character pass reference fits the smallest QR, with its three finder patterns', () => {
  const modules = qrModules('Q7M4K2XR8N')
  assert.equal(modules.length, 21)
  assert.ok(modules.every((row) => row.length === 21))
  assert.ok(finderAt(modules, 0, 0))
  assert.ok(finderAt(modules, 0, 14))
  assert.ok(finderAt(modules, 14, 0))
  assert.equal(modules[7][7], false)
})

test('two references give two different codes', () => {
  assert.notDeepEqual(qrModules('Q7M4K2XR8N'), qrModules('R8KD2WQN7T'))
})
