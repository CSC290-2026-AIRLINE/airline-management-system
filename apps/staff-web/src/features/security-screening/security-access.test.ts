import assert from 'node:assert/strict'
import test from 'node:test'
import { loadSecurityAccess } from './security-access.ts'

for (const [label, body, expected] of [
  ['Security staff', { securityScreening: true }, 'allowed'],
  ['other staff', { securityScreening: false }, 'denied'],
  ['forged role field', { role: 'security' }, 'error'],
  ['invalid capability', { securityScreening: 'true' }, 'error'],
  ['empty response', null, 'error'],
] as const) {
  test(label, async () => {
    const controller = new AbortController()
    const access = await loadSecurityAccess(async (path, init) => {
      assert.equal(path, '/api/staff/access')
      assert.equal(init?.signal, controller.signal)
      return Response.json(body)
    }, controller.signal)
    assert.equal(access, expected)
  })
}
for (const [status, expected] of [
  [401, 'unauthenticated'],
  [403, 'denied'],
  [500, 'error'],
] as const) {
  test('fails closed for HTTP ' + status, async () => {
    assert.equal(await loadSecurityAccess(async () => new Response(null, { status })), expected)
  })
}
test('network failures do not grant access', async () => {
  await assert.rejects(
    loadSecurityAccess(async () => {
      throw new Error('Offline')
    }),
    /Offline/,
  )
})
