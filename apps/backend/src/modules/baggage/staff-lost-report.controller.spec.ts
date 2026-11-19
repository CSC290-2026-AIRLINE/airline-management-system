import { StreamableFile } from '@nestjs/common'
import { Readable } from 'node:stream'
import { BAGGAGE_ERROR_CODES } from './common/baggage.errors'
import type { BagCostService } from './bag-cost.service'
import type { BagMatchingService } from './bag-matching.service'
import type { LostReportPhotoStorage } from './lost-report-photo.storage'
import type { StaffLostReportService } from './staff-lost-report.service'
import { StaffLostReportController } from './staff-lost-report.controller'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))
jest.mock('./guards/baggage-staff.guard', () => ({
  BaggageStaffGuard: class {},
  CurrentBaggageStaff: () => () => undefined,
  baggageAuditActor: jest.fn(),
}))

const REPORT_ID = '0b9c3f0e-5b0a-4f7e-9a51-3f7f3c1d2e10'

function makeController(photoUrl: string | null) {
  const reports = { getById: jest.fn().mockResolvedValue({ id: REPORT_ID, photoUrl }) }
  const photos = {
    retrieve: jest.fn().mockResolvedValue({ body: Readable.from([Buffer.from('jpg')]), contentType: 'image/jpeg', contentLength: 3 }),
  }
  const controller = new StaffLostReportController(
    reports as unknown as StaffLostReportService,
    {} as BagCostService,
    {} as BagMatchingService,
    photos as unknown as LostReportPhotoStorage,
  )
  return { controller, reports, photos }
}

describe('StaffLostReportController photo', () => {
  it('streams the photo the passenger attached', async () => {
    const { controller, photos } = makeController('feature10/lost-reports/x/photo')

    const file = await controller.getPhoto(REPORT_ID)

    expect(file).toBeInstanceOf(StreamableFile)
    expect(file.getHeaders()).toMatchObject({ type: 'image/jpeg', length: 3 })
    expect(photos.retrieve).toHaveBeenCalledWith(REPORT_ID)
  })

  it('answers not found when the case has no photo', async () => {
    const { controller, photos } = makeController(null)

    await expect(controller.getPhoto(REPORT_ID)).rejects.toMatchObject({ code: BAGGAGE_ERROR_CODES.PHOTO_NOT_FOUND })
    expect(photos.retrieve).not.toHaveBeenCalled()
  })
})

describe('StaffLostReportController cancel', () => {
  it('passes the reason and the signed-in staff member to the service', async () => {
    const reports = { cancel: jest.fn().mockResolvedValue({ id: REPORT_ID, status: 'cancelled' }) }
    const controller = new StaffLostReportController(
      reports as unknown as StaffLostReportService,
      {} as BagCostService,
      {} as BagMatchingService,
      {} as LostReportPhotoStorage,
    )
    const staff = { id: 'u-1', email: 'desk@example.com', staffId: '11111111-1111-4111-8111-111111111111', roleCode: 'baggage' }

    await expect(controller.cancel(staff, REPORT_ID, { reason: 'Duplicate case' })).resolves.toMatchObject({ status: 'cancelled' })
    expect(reports.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: REPORT_ID, reason: 'Duplicate case', staffId: staff.staffId }),
    )
  })
})
