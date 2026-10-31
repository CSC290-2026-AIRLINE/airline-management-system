import { BadRequestException } from '@nestjs/common'
import { SetupCrewController } from './setup-crew.controller'
import type { SetupCrewService } from './setup-crew.service'

// The service module only needs these two for types; the real ones are ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/db/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))

const ID = '0f4b6a52-6d1c-4f0e-9a52-0d3d6a9b7c11'

function setup() {
  const service = {
    getCrew: jest.fn().mockResolvedValue({ id: ID }),
    updateCrew: jest.fn(),
    addCertification: jest.fn(),
    updateCertification: jest.fn(),
    removeCertification: jest.fn(),
  }
  return { service, controller: new SetupCrewController(service as unknown as SetupCrewService) }
}

describe('SetupCrewController ids', () => {
  it('answers 400, not a database error, when the crew id is not a UUID', async () => {
    const { controller, service } = setup()

    await expect(controller.getCrew('abc')).rejects.toThrow(BadRequestException)
    await expect(controller.updateCrew('abc', {})).rejects.toThrow('crewId must be a UUID')
    await expect(controller.addCertification('abc', {})).rejects.toThrow(BadRequestException)
    expect(service.getCrew).not.toHaveBeenCalled()
    expect(service.updateCrew).not.toHaveBeenCalled()
  })

  it('answers 400 when the certification id is not a UUID', async () => {
    const { controller, service } = setup()

    await expect(controller.updateCertification(ID, 'nope', {})).rejects.toThrow('certificationId must be a UUID')
    await expect(controller.removeCertification(ID, 'nope')).rejects.toThrow(BadRequestException)
    expect(service.removeCertification).not.toHaveBeenCalled()
  })

  it('passes a well-formed id through', async () => {
    const { controller, service } = setup()

    await controller.getCrew(ID)
    await controller.removeCertification(ID, ID)

    expect(service.getCrew).toHaveBeenCalledWith(ID)
    expect(service.removeCertification).toHaveBeenCalledWith(ID, ID)
  })
})
