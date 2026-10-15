import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { CreateFareClassDto } from './dto/create-fare-class.dto'
import { UpdateFareClassDto } from './dto/update-fare-class.dto'
import { FareClassService } from './fare-class.service'

@Controller('staff/fare-classes')
export class FareClassController {
  constructor(private readonly fareClassService: FareClassService) {}

  @Get()
  findAll(@Query('include_inactive') includeInactive?: string) {
    return this.fareClassService.findAll(includeInactive === 'true')
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fareClassService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateFareClassDto) {
    return this.fareClassService.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFareClassDto) {
    return this.fareClassService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.fareClassService.remove(id)
  }
}
