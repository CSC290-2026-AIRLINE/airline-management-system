import { toErrorBody } from './flight-error.filter'

describe('toErrorBody', () => {
  it('wraps a plain message', () => {
    expect(toErrorBody(404, 'Flight not found')).toEqual({ error: { code: 'not_found', message: 'Flight not found' } })
  })

  it('keeps the failing rules as details', () => {
    const body = toErrorBody(409, { message: 'Gate failed', violations: [{ detail: 'short' }], error: 'Conflict', statusCode: 409 })
    expect(body).toEqual({ error: { code: 'conflict', message: 'Gate failed', details: { violations: [{ detail: 'short' }] } } })
  })

  it('joins a list of field problems and keeps the list as details', () => {
    const body = toErrorBody(400, { message: ['a is bad', 'b is bad'], error: 'Bad Request', statusCode: 400 })
    expect(body).toEqual({ error: { code: 'bad_request', message: 'a is bad; b is bad', details: { problems: ['a is bad', 'b is bad'] } } })
  })
})
