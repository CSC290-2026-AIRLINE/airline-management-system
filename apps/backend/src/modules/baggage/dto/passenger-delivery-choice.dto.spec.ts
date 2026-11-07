import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { PASSENGER_DELIVERY_TYPES, PassengerDeliveryChoiceDto } from './passenger-delivery-choice.dto'

async function errors(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(PassengerDeliveryChoiceDto, input)
  const validationErrors = await validate(dto)
  return validationErrors.map((error) => error.property)
}

describe('PassengerDeliveryChoiceDto', () => {
  it.each(['home', 'hotel', 'other_address'] as const)('accepts an address choice: %s', async (deliveryType) => {
    const input = { deliveryType, address: '  12 Main Street  ' }
    const dto = plainToInstance(PassengerDeliveryChoiceDto, input)

    expect(await errors(input)).toEqual([])
    expect(dto.address).toBe('12 Main Street')
  })

  it('accepts airport pickup and trims and uppercases the airport code', async () => {
    const input = { deliveryType: 'airport_pickup', pickupAirport: '  yyz  ' }
    const dto = plainToInstance(PassengerDeliveryChoiceDto, input)

    expect(await errors(input)).toEqual([])
    expect(dto.pickupAirport).toBe('YYZ')
  })

  it('declares only the schema-supported choice values', () => {
    expect(PASSENGER_DELIVERY_TYPES).toEqual(['home', 'hotel', 'other_address', 'airport_pickup'])
  })

  it.each([
    [{ deliveryType: 'office', address: '12 Main Street' }, 'deliveryType'],
    [{ deliveryType: 'home' }, 'address'],
    [{ deliveryType: 'hotel', address: '   ' }, 'address'],
    [{ deliveryType: 'other_address', address: 'a'.repeat(501) }, 'address'],
    [{ deliveryType: 'airport_pickup' }, 'pickupAirport'],
    [{ deliveryType: 'airport_pickup', pickupAirport: '12A' }, 'pickupAirport'],
    [{ deliveryType: 'airport_pickup', pickupAirport: 'YYZZ' }, 'pickupAirport'],
  ])('rejects invalid choice input %j', async (input, property) => {
    expect(await errors(input)).toContain(property)
  })
})
