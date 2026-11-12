import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AddBagCostDto } from './add-bag-cost.dto'
import { CreateStaffLostReportDto } from './create-staff-lost-report.dto'
import { ListLostReportsQuery } from './list-lost-reports.query'
import { ReportFromFoundBagDto } from './report-from-found-bag.dto'

async function errorsFor<T extends object>(cls: new () => T, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

const UUID = '22222222-2222-4222-8222-222222222222'
const desk = { bookingReference: 'ABC234', passengerId: UUID, flightId: UUID, bagType: 'suitcase', colour: 'black' }

describe('CreateStaffLostReportDto', () => {
  it('accepts the minimal desk body and optional fields', async () => {
    expect(await errorsFor(CreateStaffLostReportDto, desk)).toEqual([])
    expect(
      await errorsFor(CreateStaffLostReportDto, {
        ...desk,
        tagNumber: '0123456789',
        brand: 'Rimowa',
        description: 'Silver hard case',
        contactEmail: 'a@example.com',
        contactPhone: '+66 81 234 5678',
      }),
    ).toEqual([])
  })

  it('rejects bad values and unknown fields', async () => {
    expect(await errorsFor(CreateStaffLostReportDto, { ...desk, bookingReference: 'ABC-23' })).toEqual(['bookingReference'])
    expect(await errorsFor(CreateStaffLostReportDto, { ...desk, tagNumber: '1234567890' })).toEqual(['tagNumber'])
    expect(await errorsFor(CreateStaffLostReportDto, { ...desk, contactEmail: 'nope' })).toEqual(['contactEmail'])
    expect(await errorsFor(CreateStaffLostReportDto, { ...desk, contactPhone: '02-134-0000' })).toEqual(['contactPhone'])
    expect(await errorsFor(CreateStaffLostReportDto, { ...desk, contactPhone: '081 234 5678' })).toEqual(['contactPhone'])
    expect(await errorsFor(CreateStaffLostReportDto, { ...desk, reportedByStaffId: UUID })).toEqual(['reportedByStaffId'])
  })
})

describe('ReportFromFoundBagDto', () => {
  it('needs a found bag id', async () => {
    expect(await errorsFor(ReportFromFoundBagDto, { foundBagId: UUID })).toEqual([])
    expect(await errorsFor(ReportFromFoundBagDto, {})).toEqual(['foundBagId'])
  })
})

describe('ListLostReportsQuery', () => {
  it('checks each filter', async () => {
    expect(await errorsFor(ListLostReportsQuery, { status: 'lost', caseNumber: 'lb-2026-000001' })).toEqual([])
    expect(await errorsFor(ListLostReportsQuery, { status: 'found' })).toEqual(['status'])
    expect(await errorsFor(ListLostReportsQuery, { caseNumber: 'LB-1' })).toEqual(['caseNumber'])
  })
})

describe('AddBagCostDto', () => {
  it('accepts a positive amount with at most 2 decimals', async () => {
    expect(await errorsFor(AddBagCostDto, { kind: 'delivery', amount: 350.75, note: 'Courier to hotel' })).toEqual([])
  })

  it('rejects a bad kind or amount', async () => {
    expect(await errorsFor(AddBagCostDto, { kind: 'fuel', amount: 10 })).toEqual(['kind'])
    expect(await errorsFor(AddBagCostDto, { kind: 'delivery', amount: 0 })).toEqual(['amount'])
    expect(await errorsFor(AddBagCostDto, { kind: 'delivery', amount: 1.005 })).toEqual(['amount'])
    expect(await errorsFor(AddBagCostDto, { kind: 'delivery', amount: '100' })).toEqual(['amount'])
  })
})
