import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common/enums/request-method.enum'
import { AirportFeeController } from '../airport-fee.controller'
import { AirportController } from '../airport.controller'
import { CongestionController } from '../congestion.controller'
import { RouteController } from '../route.controller'
import { SettingsController } from '../settings.controller'
import { TimetableController } from '../timetable.controller'
import { ApprovalPolicyController } from './approval-policy.controller'
import { StaffGuard } from './staff.guard'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const contextFor = (user: object | undefined) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as never

describe('StaffGuard', () => {
  const staff = { staffIdFor: jest.fn() }
  const guard = new StaffGuard(staff as never)

  it('lets a staff member through', async () => {
    staff.staffIdFor.mockResolvedValue('staff-1')
    await expect(guard.canActivate(contextFor({ id: 'u1', email: 'a@b.c' }))).resolves.toBe(true)
    expect(staff.staffIdFor).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.c' })
  })

  it('refuses a signed-in user with no staff row (a customer token) with 403', async () => {
    staff.staffIdFor.mockRejectedValue(new ForbiddenException('Only staff can change flights'))
    await expect(guard.canActivate(contextFor({ id: 'customer', email: 'c@d.e' }))).rejects.toThrow(ForbiddenException)
  })

  it('refuses a request with no user with 401', async () => {
    staff.staffIdFor.mockRejectedValue(new UnauthorizedException())
    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(UnauthorizedException)
  })

  // Every write route of the master data carries the guard; reads stay open to any signed-in user.
  it.each([
    AirportController,
    RouteController,
    TimetableController,
    AirportFeeController,
    CongestionController,
    SettingsController,
    ApprovalPolicyController,
  ])('%p guards every POST, PUT and DELETE handler', (controller) => {
    const proto = controller.prototype as unknown as Record<string, unknown>
    const handlers = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .map((name) => proto[name] as object)
    const writes = handlers.filter((h) =>
      [RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE].includes(Reflect.getMetadata(METHOD_METADATA, h) as RequestMethod),
    )
    expect(writes.length).toBeGreaterThan(0)
    for (const h of writes) expect(Reflect.getMetadata(GUARDS_METADATA, h)).toEqual([StaffGuard])
    for (const h of handlers.filter((h) => !writes.includes(h))) expect(Reflect.getMetadata(GUARDS_METADATA, h)).toBeUndefined()
  })
})
