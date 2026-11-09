import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AuditQueryDto } from './audit-query.dto'
import { RegisterScreenRequestDto } from './register-screen.dto'
import { ReplaceRoleScreensDto } from './replace-role-screens.dto'
import { toAdminValidationError } from '../admin-error'

/** The failing property names, as the controller's ValidationPipe would see them. */
async function failing<T extends object>(cls: new () => T, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

describe('AuditQueryDto', () => {
  it('accepts a UUID actor_id, a 19-digit cursor, plain dates and instants', async () => {
    expect(
      await failing(AuditQueryDto, {
        actor_id: '3f1c2b9e-5a7d-4c2e-9b1f-0a2b3c4d5e6f',
        cursor: '9223372036854775807',
        from: '2026-11-01',
        to: '2026-11-01T23:59:59.999+07:00',
      }),
    ).toEqual([])
  })

  it('rejects an actor_id that is not a UUID (was a 500 from Postgres)', async () => {
    expect(await failing(AuditQueryDto, { actor_id: 'kaow' })).toEqual(['actor_id'])
  })

  it('rejects a cursor that does not fit in BIGINT (was a 500 from Postgres)', async () => {
    expect(await failing(AuditQueryDto, { cursor: '9223372036854775808' })).toEqual(['cursor'])
    expect(await failing(AuditQueryDto, { cursor: '1'.repeat(24) })).toEqual(['cursor'])
  })

  it('rejects a date that does not exist', async () => {
    expect(await failing(AuditQueryDto, { to: '2026-02-30' })).toEqual(['to'])
  })
})

describe('ReplaceRoleScreensDto', () => {
  it('rejects a screen id that is not a UUID', async () => {
    expect(await failing(ReplaceRoleScreensDto, { screen_ids: ['nope'], reason: 'Quarterly access review' })).toEqual(['screen_ids'])
  })
})

describe('RegisterScreenRequestDto', () => {
  const ok = { code: 'f05.refunds', name: 'Refunds', reason: 'Finance asked for the refunds screen' }

  it('accepts a dotted code and an assignable screen', async () => {
    expect(await failing(RegisterScreenRequestDto, { ...ok, kind: 'assignable', feature_no: '05' })).toEqual([])
  })

  it('refuses core and admin screens, and a missing reason', async () => {
    expect(await failing(RegisterScreenRequestDto, { ...ok, kind: 'core' })).toEqual(['kind'])
    expect(await failing(RegisterScreenRequestDto, { code: ok.code, name: ok.name })).toEqual(['reason'])
  })
})

describe('toAdminValidationError', () => {
  it('reports a bad reason as REASON_REQUIRED and anything else as VALIDATION_FAILED with the fields', async () => {
    const reasonErrors = await validate(plainToInstance(ReplaceRoleScreensDto, { screen_ids: [], reason: 'x' }))
    expect(toAdminValidationError(reasonErrors).getResponse()).toMatchObject({ error: { code: 'REASON_REQUIRED' } })

    const fieldErrors = await validate(plainToInstance(AuditQueryDto, { actor_id: 'kaow' }))
    const body = toAdminValidationError(fieldErrors).getResponse() as { error: { code: string; details: { fields: object } } }
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(body.error.details.fields).toHaveProperty('actor_id')
    expect(toAdminValidationError(fieldErrors).getStatus()).toBe(400)
  })
})
