import { DbScheduleApprovals } from './schedule-approvals'

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`)
const APPROVAL = '00000000-0000-0000-0000-0000000000b1'
const AIRCRAFT = '00000000-0000-0000-0000-0000000000a1'

const request = {
  approvalId: APPROVAL,
  purpose: 'new_flight' as const,
  flightId: null,
  flightNumber: 'ZZ101',
  serviceDate: new Date('2026-11-02T00:00:00Z'),
  aircraftId: AIRCRAFT,
  depAt: at('09:00'),
  arrAt: at('11:00'),
}
const row = (over: object = {}) => ({
  status: 'approved',
  purpose: 'new_flight',
  flight_id: null,
  flight_number: 'ZZ101',
  service_date: '2026-11-02',
  aircraft_id: AIRCRAFT,
  proposed_dep_at: at('09:00'),
  proposed_arr_at: at('11:00'),
  ...over,
})

describe('DbScheduleApprovals', () => {
  const tx = { $queryRaw: jest.fn(), schedule_approval: { update: jest.fn() } }
  const approvals = new DbScheduleApprovals()
  const consume = (over: object = {}) => approvals.consume(tx as never, { ...request, ...over })

  beforeEach(() => jest.clearAllMocks())

  it('passes an approved approval that matches the request', async () => {
    tx.$queryRaw.mockResolvedValue([row()])
    await expect(consume()).resolves.toEqual({ ok: true })
  })

  it('reports an unknown approval as missing', async () => {
    tx.$queryRaw.mockResolvedValue([])
    await expect(consume()).resolves.toMatchObject({ ok: false, rule: 'approval_missing' })
  })

  it.each(['pending', 'alternative_offered', 'rejected', 'superseded', 'consumed', 'expired'])(
    'refuses a %s approval as missing',
    async (status) => {
      tx.$queryRaw.mockResolvedValue([row({ status })])
      await expect(consume()).resolves.toMatchObject({ ok: false, rule: 'approval_missing', detail: expect.stringContaining(status) })
    },
  )

  it.each([
    ['aircraft', { aircraftId: '00000000-0000-0000-0000-0000000000a2' }],
    ['departure time', { depAt: at('09:30') }],
    ['arrival time', { arrAt: at('11:30') }],
    ['flight_number', { flightNumber: 'ZZ999' }],
    ['service_date', { serviceDate: new Date('2026-11-03T00:00:00Z') }],
    ['purpose', { purpose: 'reschedule' as const }],
  ])('refuses an approval whose %s differs, as a mismatch', async (name, over) => {
    tx.$queryRaw.mockResolvedValue([row()])
    await expect(consume(over)).resolves.toMatchObject({ ok: false, rule: 'approval_mismatch', detail: expect.stringContaining(name) })
  })

  it('marks the approval consumed by the flight', async () => {
    await approvals.markConsumed(tx as never, APPROVAL, 'f-new')
    expect(tx.schedule_approval.update).toHaveBeenCalledWith({
      where: { id: APPROVAL },
      data: expect.objectContaining({ status: 'consumed', resulting_flight_id: 'f-new' }),
    })
  })
})
