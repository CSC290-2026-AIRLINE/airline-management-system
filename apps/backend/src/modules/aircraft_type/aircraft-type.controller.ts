import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common'
import { AircraftTypeService } from './aircraft-type.service'
import { CreateAircraftTypeDto } from '../dto/create-aircraft-type.dto'
import { UpdateAircraftTypeDto } from '../dto/update-aircraft-type.dto'
import { Public } from '../../auth/decorators/public.decorator'

@Controller('aircraft-types')
export class AircraftTypeController {
  constructor(private readonly aircraftTypeService: AircraftTypeService) {}

  @Public()
  @Get()
  findAll() {
    return this.aircraftTypeService.findAll()
  }

  @Public()
  @Post()
  create(@Body() createAircraftTypeDto: CreateAircraftTypeDto) {
    return this.aircraftTypeService.create(createAircraftTypeDto)
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aircraftTypeService.findOne(id)
  }

  @Public()
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateAircraftTypeDto: UpdateAircraftTypeDto,
  ) {
    return this.aircraftTypeService.update(id, updateAircraftTypeDto)
  }

  @Public()
  @Post(':id/clone')
  clone(@Param('id') id: string, @Body() body: { code: string; layout?: any }) {
    return this.aircraftTypeService.clone(id, body.code, body.layout)
  }
}
