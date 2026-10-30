import { FoundBagService } from './found-bag.service'
import { InMemoryFoundBagRepository } from './mocks/in-memory-found-bag.repository'
import { MockCheckedBagDetailsLookup } from './mocks/mock-checked-bag-details.lookup'
import type { FoundBag } from './common/found-bag.types'
import type { CheckedBagRecord, FoundBagRecordedListener } from './common/found-bag.ports'

describe('FoundBagService', () => {
  let service: FoundBagService
  let recorded: { bag: FoundBag; checkedBag: CheckedBagRecord | null }[]

  const validInput = {
    staffId: 'S001',
    foundAirport: 'NRT',
    bagType: 'suitcase' as const,
    colour: 'black' as const,
  }

  beforeEach(() => {
    recorded = []

    const listener: FoundBagRecordedListener = {
      onFoundBagRecorded: (bag, checkedBag) => {
        recorded.push({ bag, checkedBag })
        return Promise.resolve()
      },
    }

    service = new FoundBagService(
      new InMemoryFoundBagRepository(),
      new MockCheckedBagDetailsLookup([
        {
          checkedBagId: 'CB001',
          tagNumber: '0123456789',
          bookingPassengerId: 'BP001',
          flightId: 'F001',
        },
      ]),
      { now: () => new Date('2026-10-30T08:00:00Z') },
      [listener],
    )
  })

  it('records a held staff bag with the simulation time', async () => {
    const bag = await service.record(validInput)

    expect(bag.status).toBe('held')
    expect(bag.source).toBe('staff')
    expect(bag.recordedBy).toBe('S001')
    expect(bag.foundAt).toEqual(new Date('2026-10-30T08:00:00Z'))
    expect(bag.checkedBagId).toBeNull()
  })

  it('links a tagged bag to its Feature 6 checked bag', async () => {
    const bag = await service.record({ ...validInput, tagNumber: '0123456789' })

    expect(bag.checkedBagId).toBe('CB001')
    expect(bag.tagNumber).toBe('0123456789')
  })

  it('keeps the flight the bag came off instead of the booked flight', async () => {
    const bag = await service.record({ ...validInput, tagNumber: '0123456789', flightId: 'F999' })

    expect(bag.flightId).toBe('F999')
  })

  it('records a tag Feature 6 does not know without an owner link', async () => {
    const bag = await service.record({ ...validInput, tagNumber: '0555555555' })

    expect(bag.tagNumber).toBe('0555555555')
    expect(bag.checkedBagId).toBeNull()
  })

  it('rejects an invalid baggage tag', async () => {
    await expect(service.record({ ...validInput, tagNumber: '1234567890' })).rejects.toMatchObject({
      code: 'INVALID_TAG',
    })
  })

  it('rejects a bag type or colour outside the fixed lists', async () => {
    await expect(service.record({ ...validInput, colour: 'navy' as never })).rejects.toMatchObject({
      code: 'INVALID_FOUND_BAG',
    })
  })

  it('requires the recording staff member', async () => {
    await expect(service.record({ ...validInput, staffId: ' ' })).rejects.toMatchObject({
      code: 'INVALID_FOUND_BAG',
    })
  })

  it('requires a 3-letter airport code and normalises its case', async () => {
    await expect(service.record({ ...validInput, foundAirport: 'Tokyo' })).rejects.toMatchObject({
      code: 'INVALID_FOUND_BAG',
    })

    const bag = await service.record({ ...validInput, foundAirport: 'bkk' })

    expect(bag.foundAirport).toBe('BKK')
  })

  it('refuses to record the same checked bag twice', async () => {
    await service.record({ ...validInput, tagNumber: '0123456789' })

    await expect(service.record({ ...validInput, tagNumber: '0123456789' })).rejects.toMatchObject({
      code: 'FOUND_BAG_EXISTS',
    })
  })

  it('notifies listeners with the Feature 6 bag so matching can run', async () => {
    const bag = await service.record({ ...validInput, tagNumber: '0123456789' })

    expect(recorded).toHaveLength(1)
    expect(recorded[0].bag.id).toBe(bag.id)
    expect(recorded[0].checkedBag?.bookingPassengerId).toBe('BP001')
  })

  it('finds a bag by id and reports a missing one', async () => {
    const bag = await service.record(validInput)

    await expect(service.getById(bag.id)).resolves.toMatchObject({ id: bag.id })
    await expect(service.getById('missing')).rejects.toMatchObject({
      code: 'FOUND_BAG_NOT_FOUND',
    })
  })

  it('lists bags filtered by tag, airport and status', async () => {
    await service.record({ ...validInput, tagNumber: '0123456789' })
    await service.record({ ...validInput, foundAirport: 'BKK' })

    expect(await service.list({ tagNumber: '0123456789' })).toHaveLength(1)
    expect(await service.list({ foundAirport: 'bkk' })).toHaveLength(1)
    expect(await service.list({ status: 'held' })).toHaveLength(2)
    expect(await service.list({ status: 'matched' })).toHaveLength(0)
  })
})
