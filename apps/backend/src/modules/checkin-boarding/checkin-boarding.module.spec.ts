import { Test } from '@nestjs/testing'
import { DbService } from '@backend/db/db.service'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import type { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { CheckinBoardingModule } from './checkin-boarding.module'
import { F06_SCREENS } from './checkin-boarding.screens'

// The admin console pulls in the Prisma client, which is ESM only. The spec never talks to a real database.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('CheckinBoardingModule screen registration', () => {
  it('registers the F6 screens with the admin console', async () => {
    const adminConsole = { registerSelfScreens: jest.fn().mockResolvedValue(undefined) }

    await new CheckinBoardingModule(adminConsole as unknown as AdminConsoleService).onModuleInit()

    expect(adminConsole.registerSelfScreens).toHaveBeenCalledTimes(1)
    expect(adminConsole.registerSelfScreens).toHaveBeenCalledWith(F06_SCREENS)
  })

  it('registers nothing when the admin console is not wired in', async () => {
    await expect(new CheckinBoardingModule().onModuleInit()).resolves.toBeUndefined()
  })

  it('imports the admin console in db mode only', () => {
    expect(CheckinBoardingModule.register('db').imports).toContain(AdminConsoleModule)
    expect(CheckinBoardingModule.register('memory').imports).not.toContain(AdminConsoleModule)
  })

  it('registers the screens on boot in db mode', async () => {
    // An empty registry: no screens yet, none edited by an admin (audit_log), so every screen is created.
    const create = jest
      .fn()
      .mockImplementation(({ data }: { data: { code: string; name: string; kind: string; feature_no: string } }) =>
        Promise.resolve({ id: `id-${data.code}`, ...data, is_active: true }),
      )
    const moduleRef = await Test.createTestingModule({ imports: [CheckinBoardingModule.register('db')] })
      .overrideProvider(DbService)
      .useValue({
        screen: { findUnique: jest.fn().mockResolvedValue(null), create, findMany: jest.fn().mockResolvedValue([]) },
        audit_log: { findMany: jest.fn().mockResolvedValue([]) },
      })
      .compile()

    await moduleRef.init()

    const codes = create.mock.calls.map(([args]: [{ data: { code: string } }]) => args.data.code)
    expect(codes).toEqual(expect.arrayContaining(F06_SCREENS.map((s) => s.code)))
    await moduleRef.close()
  })

  it('uses the codes the staff-web sidebar asks for', () => {
    expect(F06_SCREENS.map((s) => s.code)).toEqual(['f06.counter', 'f06.issues', 'f06.gate'])
  })
})
