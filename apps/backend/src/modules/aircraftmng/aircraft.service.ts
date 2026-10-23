import { Injectable } from '@nestjs/common';
import { CreateAircraftDto } from './dto/create-aircraft.dto';

@Injectable()
export class AircraftService {
  private aircrafts = [
    { id: '1', tailNumber: 'HS-ABC', type: 'A320', base: 'BKK', status: 'IN_MAINTENANCE' },
    { id: '2', tailNumber: 'HS-BRU', type: 'B737', base: 'DMK', status: 'IN_SERVICE' },
    { id: '3', tailNumber: 'HS-CAT', type: 'A320', base: 'BKK', status: 'GROUNDED' },
  ];

  findAll() {
    return this.aircrafts;
  }

  create(createAircraftDto: CreateAircraftDto) {
    const newAircraft = {
      id: Date.now().toString(),
      ...createAircraftDto,
    };
    this.aircrafts.push(newAircraft);
    return newAircraft;
  }
}