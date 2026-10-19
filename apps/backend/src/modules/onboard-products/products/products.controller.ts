// Products HTTP surface under /api/staff/products. PUT only: list
// (GET), create (PUT), update (PUT), delete (PUT with { deleted: true
// } on body) is rejected in favor of the dedicated DELETE. Image
// upload is encoded in the same JSON body as a base64 data URL.

import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common'
import { StaffGuard } from '../common/staff.guard'
import { NoopStorageService } from '../common/cross-module-ports'
import { ProductsService } from './products.service'
import { parseProductDraft, parseProductPatch } from './dto/product.dto'

@Controller('staff/products')
@UseGuards(StaffGuard)
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly storage: NoopStorageService,
  ) {}

  @Get()
  async list() {
    return this.products.list()
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.products.get(id)
  }

  @Put()
  @HttpCode(201)
  async create(@Body() body: unknown) {
    return this.products.create(parseProductDraft(body), this.storage)
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.products.update(id, parseProductPatch(body), this.storage)
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.products.remove(id)
  }
}
