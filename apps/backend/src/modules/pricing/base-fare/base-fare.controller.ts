import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { CreateBaseFareDto } from './dto/create-base-fare.dto'
import { ListBaseFaresDto } from './dto/list-base-fares.dto'
import { UpdateBaseFareDto } from './dto/update-base-fare.dto'
import { BaseFareService } from './base-fare.service'

@Controller('staff/base-fares')
export class BaseFareController {
  constructor(private readonly baseFareService: BaseFareService) {}

  @Get()
  findAll(@Query() filter: ListBaseFaresDto) {
    return this.baseFareService.findAll(filter)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.baseFareService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateBaseFareDto) {
    return this.baseFareService.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBaseFareDto) {
    return this.baseFareService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.baseFareService.remove(id)
  }
}
