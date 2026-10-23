import { Controller, Get, Post, Body } from '@nestjs/common';
import { AircraftService } from './aircraft.service';
import { CreateAircraftDto } from '../dto/create-aircraft.dto';
import { Public } from '../../auth/decorators/public.decorator'; 

@Controller('aircraft')
export class AircraftController {
  constructor(private readonly aircraftService: AircraftService) {}

  @Public()
  @Get()
  findAll() {
    return this.aircraftService.findAll();
  }

  @Public() 
  @Post()
  create(@Body() createAircraftDto: CreateAircraftDto) {
    return this.aircraftService.create(createAircraftDto);
  }
}