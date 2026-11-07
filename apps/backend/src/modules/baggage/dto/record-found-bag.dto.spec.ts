import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RecordFoundBagDto } from './record-found-bag.dto'
import { ListFoundBagsQuery } from './list-found-bags.query'
import { SaveStationContactDto } from './save-station-contact.dto'

async function errorsFor<T extends object>(cls: new () => T, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })
  return errors.map((e) => e.property)
}

const valid = { foundAirport: 'NRT', bagType: 'suitcase', colour: 'black' }

describe('RecordFoundBagDto', () => {
  it('accepts the minimal staff body and optional fields', async () => {
    expect(await errorsFor(RecordFoundBagDto, valid)).toEqual([])
    expect(
      await errorsFor(RecordFoundBagDto, {
        ...valid,
        tagNumber: '0123456789',
        flightId: '22222222-2222-4222-8222-222222222222',
        brand: 'Samsonite',
        description: 'Red ribbon on the handle',
      }),
    ).toEqual([])
  })

  it('rejects bad values and unknown fields', async () => {
    expect(await errorsFor(RecordFoundBagDto, { ...valid, colour: 'navy' })).toEqual(['colour'])
    expect(await errorsFor(RecordFoundBagDto, { ...valid, tagNumber: '1234567890' })).toEqual(['tagNumber'])
    expect(await errorsFor(RecordFoundBagDto, { ...valid, foundAirport: 'Tokyo' })).toEqual(['foundAirport'])
    expect(await errorsFor(RecordFoundBagDto, { ...valid, flightId: 'TG640' })).toEqual(['flightId'])
    expect(await errorsFor(RecordFoundBagDto, { ...valid, staffId: 'someone-else' })).toEqual(['staffId'])
  })
})

describe('ListFoundBagsQuery', () => {
  it('accepts known filters and rejects an unknown status', async () => {
    expect(await errorsFor(ListFoundBagsQuery, { status: 'held', foundAirport: 'bkk' })).toEqual([])
    expect(await errorsFor(ListFoundBagsQuery, { status: 'lost' })).toEqual(['status'])
  })
})

describe('SaveStationContactDto', () => {
  it('accepts a desk with phone and optional email, and rejects a bad phone or email', async () => {
    expect(await errorsFor(SaveStationContactDto, { deskName: 'Baggage Services', phone: '+66 2 134 0000' })).toEqual([])
    expect(await errorsFor(SaveStationContactDto, { deskName: 'Baggage Services', phone: 'call me' })).toEqual(['phone'])
    expect(await errorsFor(SaveStationContactDto, { deskName: 'Baggage Services', phone: '021340000', email: 'nope' })).toEqual(['email'])
  })
})
