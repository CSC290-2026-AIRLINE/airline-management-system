import { Controller, Get, Inject } from '@nestjs/common'
import { AIRCRAFT_DIRECTORY, type AircraftDirectory } from './aircraft-directory'

/** The aircraft a flight can be given, for the pickers in the staff screens. Read-only, from the aircraft directory. */
@Controller('flight-scheduling/aircraft')
export class AircraftController {
  constructor(@Inject(AIRCRAFT_DIRECTORY) private readonly aircraft: AircraftDirectory) {}

  @Get()
  async list() {
    const aircraft = await this.aircraft.list()
    return {
      data: aircraft.map((a) => ({
        id: a.id,
        tail_number: a.tailNumber,
        type_code: a.typeCode,
        model: a.model,
        max_range_km: a.maxRangeKm,
      })),
    }
  }
}
