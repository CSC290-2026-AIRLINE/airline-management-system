import type { ArgumentsHost } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { BadIdFilter } from './bad-id.filter'

function hostWith() {
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost
  return { host, status, json }
}

describe('BadIdFilter', () => {
  it('answers 404 when Postgres refuses an id that is no UUID', () => {
    const { host, status, json } = hostWith()
    const refused = Object.assign(new Error('Invalid input value: invalid input syntax for type uuid: "abc"'), { code: 'P2007' })
    new BadIdFilter().catch(refused, host)
    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'Not found' } })
  })

  it('leaves every other error to the handler of the framework', () => {
    const { host, status } = hostWith()
    const next = jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined)
    const other = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    new BadIdFilter().catch(other, host)
    expect(next).toHaveBeenCalledWith(other, host)
    expect(status).not.toHaveBeenCalled()
    next.mockRestore()
  })
})
